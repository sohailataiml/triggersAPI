import type { PrismaClient } from '@triggers/database';
import { newId, DeliveryStatus, Prisma } from '@triggers/database';
import { generateLeaseToken, hashLeaseToken, verifyLeaseToken } from '@triggers/domain';
import {
  InvalidStateError,
  LeaseConflictError,
  LeaseExpiredError,
  NotFoundError,
  type AckResponse,
  type InboxItem,
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

    // Post-commit side effects.
    if (items.length > 0) {
      this.metrics.deliveriesLeased.inc(items.length);
      this.metrics.activeLeases.inc(items.length);
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
        this.metrics.activeLeases.dec();
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
}
