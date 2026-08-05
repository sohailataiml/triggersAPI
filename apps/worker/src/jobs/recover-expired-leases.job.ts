import type { Redis } from 'ioredis';
import type { PrismaClient } from '@triggers/database';
import { DeliveryStatus } from '@triggers/database';
import { computeRetryDelayMs, decideRetryOutcome } from '@triggers/domain';
import type { ExplorerActivity } from '@triggers/contracts';

const EXPLORER_ACTIVITY_STREAM = 'triggers:explorer:activity';

/**
 * Proactively recover deliveries whose lease expired without an ACK, moving
 * them to RETRY_SCHEDULED (with backoff) or DEAD_LETTER. Shares the retry
 * policy (`decideRetryOutcome`, `computeRetryDelayMs`) with the API so both
 * paths behave identically. PostgreSQL remains authoritative; the API inbox
 * query also recovers overdue leases defensively.
 */
export async function recoverExpiredLeases(
  prisma: PrismaClient,
  activityRedis: Redis,
  streamMaxLength: number,
  limit = 100,
): Promise<number> {
  const activities: ExplorerActivity[] = [];

  const count = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "deliveries"
      WHERE "status" = 'LEASED' AND "leaseUntil" <= NOW()
      ORDER BY "leaseUntil", id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;

    for (const row of rows) {
      const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: row.id } });
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: delivery.subscriptionId },
        select: { maxAttempts: true },
      });

      const decision = decideRetryOutcome(delivery.attemptCount, subscription.maxAttempts);
      const now = new Date();
      const cleared = {
        leaseTokenHash: null,
        leasedAt: null,
        leaseUntil: null,
        consumerInstanceId: null,
        lastErrorCode: 'lease_expired',
        lastErrorMessage: 'Lease expired before acknowledgment',
      };

      if (decision.isDeadLetter) {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.DEAD_LETTER, deadLetteredAt: now, ...cleared },
        });
      } else {
        const availableAt = new Date(now.getTime() + computeRetryDelayMs(delivery.attemptCount));
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.RETRY_SCHEDULED, availableAt, ...cleared },
        });
      }

      activities.push({
        type: decision.isDeadLetter ? 'delivery.dead_lettered' : 'delivery.retry_scheduled',
        timestamp: now.toISOString(),
        workspaceId: delivery.workspaceId,
        eventId: delivery.eventId,
        deliveryId: delivery.id,
        subscriptionId: delivery.subscriptionId,
        status: decision.isDeadLetter ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
        summary: { attempt: delivery.attemptCount, reason: 'lease_expired' },
      });
    }

    return rows.length;
  });

  // Best-effort activity emission for the live Explorer stream.
  for (const activity of activities) {
    try {
      await activityRedis.xadd(
        EXPLORER_ACTIVITY_STREAM,
        'MAXLEN',
        '~',
        streamMaxLength,
        '*',
        'type',
        activity.type,
        'data',
        JSON.stringify(activity),
      );
    } catch {
      // Redis is advisory here; DB state is already committed.
    }
  }

  return count;
}
