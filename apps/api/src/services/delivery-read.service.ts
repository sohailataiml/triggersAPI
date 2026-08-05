import type { Delivery, PrismaClient } from '@triggers/database';
import { NotFoundError, type DeliveryDetail } from '@triggers/contracts';

export function toDeliveryDetail(d: Delivery): DeliveryDetail {
  return {
    id: d.id,
    eventId: d.eventId,
    subscriptionId: d.subscriptionId,
    status: d.status,
    attemptCount: d.attemptCount,
    availableAt: d.availableAt.toISOString(),
    leasedAt: d.leasedAt?.toISOString() ?? null,
    leaseUntil: d.leaseUntil?.toISOString() ?? null,
    consumerInstanceId: d.consumerInstanceId,
    acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null,
    deadLetteredAt: d.deadLetteredAt?.toISOString() ?? null,
    lastErrorCode: d.lastErrorCode,
    lastErrorMessage: d.lastErrorMessage,
    replayCount: d.replayCount,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** Read-only delivery queries for admin/Explorer views. */
export class DeliveryReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDetail(workspaceId: string, id: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findFirst({ where: { id, workspaceId } });
    if (!delivery) throw new NotFoundError('Delivery not found');
    return toDeliveryDetail(delivery);
  }
}
