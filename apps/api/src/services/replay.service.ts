import type { PrismaClient } from '@triggers/database';
import { newId, DeliveryStatus } from '@triggers/database';
import { InvalidStateError, NotFoundError, type ReplayResponse } from '@triggers/contracts';
import type { Metrics } from '@triggers/observability';
import type { ActivityService } from './activity.service.js';

export interface ReplayParams {
  workspaceId: string;
  deliveryId: string;
  requestedBy: string;
  reason: string | null;
  idempotencyKey: string | null;
}

/** Administrative dead-letter replay with audit trail and idempotency. */
export class ReplayService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly activity: ActivityService,
    private readonly metrics: Metrics,
  ) {}

  async replay(params: ReplayParams): Promise<ReplayResponse> {
    const { deliveryId, workspaceId, requestedBy, reason, idempotencyKey } = params;

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the delivery row so concurrent replays serialize.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "deliveries"
        WHERE id = ${deliveryId}::uuid AND "workspaceId" = ${workspaceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError('Delivery not found');

      const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });

      // Idempotent replay: a prior audit with the same key returns current state.
      if (idempotencyKey) {
        const priorAudit = await tx.replayAudit.findFirst({
          where: { deliveryId, idempotencyKey },
        });
        if (priorAudit) {
          return {
            subscriptionId: delivery.subscriptionId,
            eventId: delivery.eventId,
            replayCount: delivery.replayCount,
            replayedAt: priorAudit.createdAt,
            idempotent: true,
          };
        }
      }

      if (delivery.status !== DeliveryStatus.DEAD_LETTER) {
        throw new InvalidStateError(
          `Only DEAD_LETTER deliveries can be replayed (current: ${delivery.status})`,
        );
      }

      await tx.replayAudit.create({
        data: {
          id: newId(),
          deliveryId,
          requestedBy,
          reason,
          previousStatus: delivery.status,
          idempotencyKey,
        },
      });

      const now = new Date();
      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.PENDING,
          attemptCount: 0,
          availableAt: now,
          leaseTokenHash: null,
          leasedAt: null,
          leaseUntil: null,
          consumerInstanceId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          deadLetteredAt: null,
          replayCount: { increment: 1 },
        },
      });

      return {
        subscriptionId: updated.subscriptionId,
        eventId: updated.eventId,
        replayCount: updated.replayCount,
        replayedAt: now,
        idempotent: false,
      };
    });

    if (!result.idempotent) {
      this.metrics.deliveriesReplayed.inc();
      await this.activity.append({
        type: 'delivery.replayed',
        timestamp: result.replayedAt.toISOString(),
        workspaceId,
        eventId: result.eventId,
        deliveryId,
        subscriptionId: result.subscriptionId,
        status: 'PENDING',
        summary: { reason },
      });
      await this.activity.publishWakeup(result.subscriptionId);
    }

    return {
      deliveryId,
      status: 'PENDING',
      replayCount: result.replayCount,
      replayedAt: result.replayedAt.toISOString(),
    };
  }
}
