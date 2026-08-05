import type { PrismaClient } from '@triggers/database';
import { newId, DeliveryStatus, Prisma } from '@triggers/database';
import {
  computeRetryDelayMs,
  decideRetryOutcome,
  generateLeaseToken,
  hashLeaseToken,
  verifyLeaseToken,
} from '@triggers/domain';
import {
  InvalidStateError,
  LeaseConflictError,
  LeaseExpiredError,
  NotFoundError,
  type AckResponse,
  type InboxItem,
  type NackResponse,
} from '@triggers/contracts';
import type { AppConfig } from '@triggers/config';
import type { Metrics } from '@triggers/observability';
import type { ActivityService } from './activity.service.js';

export interface LeaseParams {
  workspaceId: string;
  subscriptionId: string;
  limit: number;
  visibilityTimeoutSeconds: number;
  consumerInstanceId: string | null;
}

export interface AckParams {
  workspaceId: string;
  deliveryId: string;
  leaseToken: string;
  consumerProcessId: string;
  /** When set, the delivery's subscription must equal this (consumer scope). */
  allowedSubscriptionId: string | null;
}

export interface NackParams {
  workspaceId: string;
  deliveryId: string;
  leaseToken: string;
  reason: string | null;
  message: string | null;
  allowedSubscriptionId: string | null;
}

/** Minimal shape needed to compute a failure transition. */
interface FailingDelivery {
  id: string;
  eventId: string;
  subscriptionId: string;
  attemptCount: number;
}

interface FailureOutcome {
  status: 'RETRY_SCHEDULED' | 'DEAD_LETTER';
  availableAt: Date | null;
}

/** Lease acquisition and acknowledgment for deliveries. */
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly activity: ActivityService,
    private readonly metrics: Metrics,
  ) {}

  /**
   * Atomically lease up to `limit` available deliveries for a subscription.
   * Uses `FOR UPDATE SKIP LOCKED` so concurrent consumers never grab the same
   * row. Overdue leases (expired visibility timeout) are recovered here too,
   * providing at-least-once redelivery even if the worker is down.
   */
  async lease(params: LeaseParams): Promise<InboxItem[]> {
    const { subscriptionId, limit, visibilityTimeoutSeconds, consumerInstanceId } = params;
    const items: InboxItem[] = [];

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "deliveries"
        WHERE "subscriptionId" = ${subscriptionId}::uuid
          AND (
            ("status" IN ('PENDING', 'RETRY_SCHEDULED') AND "availableAt" <= NOW())
            OR ("status" = 'LEASED' AND "leaseUntil" <= NOW())
          )
        ORDER BY "availableAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;

      const now = new Date();
      const leaseUntil = new Date(now.getTime() + visibilityTimeoutSeconds * 1000);

      for (const row of rows) {
        const leaseToken = generateLeaseToken();
        const updated = await tx.delivery.update({
          where: { id: row.id },
          data: {
            status: DeliveryStatus.LEASED,
            attemptCount: { increment: 1 },
            leasedAt: now,
            leaseUntil,
            leaseTokenHash: hashLeaseToken(leaseToken, this.config.LEASE_TOKEN_SECRET),
            consumerInstanceId,
          },
          include: { event: true },
        });

        items.push({
          deliveryId: updated.id,
          eventId: updated.eventId,
          leaseToken,
          leaseUntil: leaseUntil.toISOString(),
          attempt: updated.attemptCount,
          event: {
            source: updated.event.source,
            eventType: updated.event.eventType,
            subject: updated.event.subject,
            payload: updated.event.payload as Record<string, unknown>,
            metadata: updated.event.metadata as Record<string, unknown>,
            receivedAt: updated.event.receivedAt.toISOString(),
          },
        });
      }
    });

    // Post-commit side effects. Gauges (active leases, pending) are refreshed
    // authoritatively at metrics-scrape time, so only counters are touched here.
    if (items.length > 0) {
      this.metrics.deliveriesLeased.inc(items.length);
      for (const item of items) {
        await this.activity.append({
          type: 'delivery.leased',
          timestamp: new Date().toISOString(),
          workspaceId: params.workspaceId,
          eventId: item.eventId,
          deliveryId: item.deliveryId,
          subscriptionId,
          status: 'LEASED',
          summary: { attempt: item.attempt },
        });
      }
    }

    return items;
  }

  /**
   * Acknowledge a delivery. Idempotent per (deliveryId, consumerProcessId):
   * a repeated ACK from the same process returns the original success even if
   * the first response was lost. A different process on an already-acknowledged
   * delivery receives the current acknowledged state without overriding it.
   */
  async ack(params: AckParams): Promise<AckResponse> {
    const { deliveryId, leaseToken, consumerProcessId, allowedSubscriptionId } = params;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.delivery.findFirst({
          where: { id: deliveryId, workspaceId: params.workspaceId },
        });
        if (!delivery) throw new NotFoundError('Delivery not found');
        if (allowedSubscriptionId && delivery.subscriptionId !== allowedSubscriptionId) {
          throw new NotFoundError('Delivery not found');
        }

        // Existing receipt for this exact process => idempotent replay.
        const receipt = await tx.ackReceipt.findUnique({
          where: {
            deliveryId_consumerProcessId: { deliveryId, consumerProcessId },
          },
        });
        if (receipt) {
          return {
            deliveryId,
            status: 'acknowledged' as const,
            acknowledgedAt: receipt.acknowledgedAt.toISOString(),
            duplicateAck: true,
          };
        }

        // Already acknowledged by a different process: return current state.
        if (delivery.status === DeliveryStatus.ACKNOWLEDGED && delivery.acknowledgedAt) {
          return {
            deliveryId,
            status: 'acknowledged' as const,
            acknowledgedAt: delivery.acknowledgedAt.toISOString(),
            duplicateAck: true,
          };
        }

        if (delivery.status !== DeliveryStatus.LEASED) {
          throw new InvalidStateError(
            `Delivery cannot be acknowledged from status ${delivery.status}`,
          );
        }
        if (!delivery.leaseUntil || delivery.leaseUntil.getTime() <= Date.now()) {
          throw new LeaseExpiredError();
        }
        if (
          !delivery.leaseTokenHash ||
          !verifyLeaseToken(leaseToken, delivery.leaseTokenHash, this.config.LEASE_TOKEN_SECRET)
        ) {
          throw new LeaseConflictError();
        }

        const acknowledgedAt = new Date();
        await tx.ackReceipt.create({
          data: { id: newId(), deliveryId, consumerProcessId, acknowledgedAt },
        });
        await tx.delivery.update({
          where: { id: deliveryId },
          data: {
            status: DeliveryStatus.ACKNOWLEDGED,
            acknowledgedAt,
            leaseTokenHash: null,
            leasedAt: null,
            leaseUntil: null,
          },
        });

        // Observe latencies while inside the handler; emit metrics/activity after.
        this.metrics.deliveriesAcknowledged.inc();
        this.metrics.deliveryEndToEndSeconds.observe(
          (acknowledgedAt.getTime() - delivery.createdAt.getTime()) / 1000,
        );

        await this.activity.append({
          type: 'delivery.acknowledged',
          timestamp: acknowledgedAt.toISOString(),
          workspaceId: params.workspaceId,
          eventId: delivery.eventId,
          deliveryId,
          subscriptionId: delivery.subscriptionId,
          status: 'ACKNOWLEDGED',
        });

        return {
          deliveryId,
          status: 'acknowledged' as const,
          acknowledgedAt: acknowledgedAt.toISOString(),
          duplicateAck: false,
        };
      });
    } catch (err) {
      // Concurrent same-process ACK: the receipt unique constraint fired.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const receipt = await this.prisma.ackReceipt.findUnique({
          where: { deliveryId_consumerProcessId: { deliveryId, consumerProcessId } },
        });
        if (receipt) {
          return {
            deliveryId,
            status: 'acknowledged',
            acknowledgedAt: receipt.acknowledgedAt.toISOString(),
            duplicateAck: true,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Negatively acknowledge a leased delivery. Validates lease ownership, then
   * schedules an exponential-backoff retry or moves the delivery to the dead
   * letter office when attempts are exhausted.
   */
  async nack(params: NackParams): Promise<NackResponse> {
    const { deliveryId, leaseToken, reason, message, allowedSubscriptionId } = params;

    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: { id: deliveryId, workspaceId: params.workspaceId },
      });
      if (!delivery) throw new NotFoundError('Delivery not found');
      if (allowedSubscriptionId && delivery.subscriptionId !== allowedSubscriptionId) {
        throw new NotFoundError('Delivery not found');
      }
      if (delivery.status !== DeliveryStatus.LEASED) {
        throw new InvalidStateError(`Delivery cannot be NACKed from status ${delivery.status}`);
      }
      if (!delivery.leaseUntil || delivery.leaseUntil.getTime() <= Date.now()) {
        throw new LeaseExpiredError();
      }
      if (
        !delivery.leaseTokenHash ||
        !verifyLeaseToken(leaseToken, delivery.leaseTokenHash, this.config.LEASE_TOKEN_SECRET)
      ) {
        throw new LeaseConflictError();
      }

      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: delivery.subscriptionId },
        select: { maxAttempts: true },
      });

      return this.applyFailure(tx, delivery, subscription.maxAttempts, reason, message);
    });

    // Metrics + activity after commit.
    this.metrics.deliveriesNacked.inc();
    if (result.outcome.status === 'RETRY_SCHEDULED') {
      this.metrics.deliveriesRetried.inc();
    } else {
      this.metrics.deliveriesDeadLettered.inc();
    }
    await this.activity.append({
      type:
        result.outcome.status === 'RETRY_SCHEDULED'
          ? 'delivery.retry_scheduled'
          : 'delivery.dead_lettered',
      timestamp: new Date().toISOString(),
      workspaceId: params.workspaceId,
      eventId: result.eventId,
      deliveryId,
      subscriptionId: result.subscriptionId,
      status: result.outcome.status,
      summary: { attempt: result.attempt, reason },
    });

    return {
      deliveryId,
      status: result.outcome.status,
      attempt: result.attempt,
      availableAt: result.outcome.availableAt ? result.outcome.availableAt.toISOString() : null,
    };
  }

  /**
   * Recover deliveries whose lease has expired without an ACK. Used by the
   * worker's scheduled job; the inbox lease query also recovers overdue leases
   * defensively, so this is a belt-and-suspenders reconciliation.
   * Returns the number of deliveries transitioned.
   */
  async recoverExpiredLeases(limit = 100): Promise<number> {
    const recovered = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "deliveries"
        WHERE "status" = 'LEASED' AND "leaseUntil" <= NOW()
        ORDER BY "leaseUntil", id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;

      const outcomes: Array<{
        eventId: string;
        subscriptionId: string;
        attempt: number;
        outcome: FailureOutcome;
      }> = [];

      for (const row of rows) {
        const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: row.id } });
        const subscription = await tx.subscription.findUniqueOrThrow({
          where: { id: delivery.subscriptionId },
          select: { maxAttempts: true },
        });
        outcomes.push(
          await this.applyFailure(
            tx,
            delivery,
            subscription.maxAttempts,
            'lease_expired',
            'Lease expired before acknowledgment',
          ),
        );
      }
      return outcomes;
    });

    for (const r of recovered) {
      this.metrics.deliveriesRetried.inc(r.outcome.status === 'RETRY_SCHEDULED' ? 1 : 0);
      this.metrics.deliveriesDeadLettered.inc(r.outcome.status === 'DEAD_LETTER' ? 1 : 0);
      await this.activity.append({
        type:
          r.outcome.status === 'RETRY_SCHEDULED'
            ? 'delivery.retry_scheduled'
            : 'delivery.dead_lettered',
        timestamp: new Date().toISOString(),
        workspaceId: '',
        eventId: r.eventId,
        subscriptionId: r.subscriptionId,
        status: r.outcome.status,
        summary: { attempt: r.attempt, reason: 'lease_expired' },
      });
    }

    return recovered.length;
  }

  /**
   * Apply the retry-or-dead-letter transition to a leased delivery within a
   * transaction. Clears all lease fields and records the failure reason.
   */
  private async applyFailure(
    tx: Prisma.TransactionClient,
    delivery: FailingDelivery,
    maxAttempts: number,
    reason: string | null,
    message: string | null,
  ): Promise<{
    eventId: string;
    subscriptionId: string;
    attempt: number;
    outcome: FailureOutcome;
  }> {
    const decision = decideRetryOutcome(delivery.attemptCount, maxAttempts);
    const now = new Date();

    const clearedLease = {
      leaseTokenHash: null,
      leasedAt: null,
      leaseUntil: null,
      consumerInstanceId: null,
      lastErrorCode: reason,
      lastErrorMessage: message,
    };

    let outcome: FailureOutcome;
    if (decision.isDeadLetter) {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.DEAD_LETTER, deadLetteredAt: now, ...clearedLease },
      });
      outcome = { status: 'DEAD_LETTER', availableAt: null };
    } else {
      const availableAt = new Date(now.getTime() + computeRetryDelayMs(delivery.attemptCount));
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.RETRY_SCHEDULED, availableAt, ...clearedLease },
      });
      outcome = { status: 'RETRY_SCHEDULED', availableAt };
    }

    return {
      eventId: delivery.eventId,
      subscriptionId: delivery.subscriptionId,
      attempt: delivery.attemptCount,
      outcome,
    };
  }
}
