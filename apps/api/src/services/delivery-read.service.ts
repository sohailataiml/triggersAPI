import type { Delivery, PrismaClient } from '@triggers/database';
import { DeliveryStatus } from '@triggers/database';
import {
  NotFoundError,
  type DeliveryDetail,
  type DeliveryListItem,
  type DeliveryListQuery,
  type EventListItem,
  type EventListQuery,
  type ExplorerOverview,
} from '@triggers/contracts';

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

  /** Filtered delivery list (enriched with event summary) for Explorer/admin. */
  async list(workspaceId: string, query: DeliveryListQuery): Promise<DeliveryListItem[]> {
    const rows = await this.prisma.delivery.findMany({
      where: {
        workspaceId,
        status: query.status,
        subscriptionId: query.subscriptionId,
        event: {
          source: query.source,
          eventType: query.eventType,
        },
      },
      include: { event: { select: { source: true, eventType: true, subject: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return rows.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      subscriptionId: d.subscriptionId,
      status: d.status,
      attemptCount: d.attemptCount,
      availableAt: d.availableAt.toISOString(),
      leaseUntil: d.leaseUntil?.toISOString() ?? null,
      acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null,
      deadLetteredAt: d.deadLetteredAt?.toISOString() ?? null,
      lastErrorCode: d.lastErrorCode,
      replayCount: d.replayCount,
      createdAt: d.createdAt.toISOString(),
      event: {
        source: d.event.source,
        eventType: d.event.eventType,
        subject: d.event.subject,
      },
    }));
  }

  /**
   * Event-centric list with a per-status delivery rollup, for the Events page.
   * `status` matches events that have at least one delivery in that status;
   * `search` is a case-insensitive contains over source/eventType/subject.
   */
  async listEvents(workspaceId: string, query: EventListQuery): Promise<EventListItem[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        workspaceId,
        source: query.source,
        eventType: query.eventType,
        ...(query.status ? { deliveries: { some: { status: query.status } } } : {}),
        ...(query.search
          ? {
              OR: [
                { source: { contains: query.search, mode: 'insensitive' } },
                { eventType: { contains: query.search, mode: 'insensitive' } },
                { subject: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { deliveries: { select: { status: true } } },
      orderBy: { receivedAt: 'desc' },
      take: query.limit,
    });

    return rows.map((e) => {
      const count = (s: DeliveryStatus) => e.deliveries.filter((d) => d.status === s).length;
      return {
        id: e.id,
        source: e.source,
        eventType: e.eventType,
        subject: e.subject,
        receivedAt: e.receivedAt.toISOString(),
        occurredAt: e.occurredAt?.toISOString() ?? null,
        deliveryCount: e.deliveries.length,
        pending: count(DeliveryStatus.PENDING),
        leased: count(DeliveryStatus.LEASED),
        retryScheduled: count(DeliveryStatus.RETRY_SCHEDULED),
        acknowledged: count(DeliveryStatus.ACKNOWLEDGED),
        deadLetter: count(DeliveryStatus.DEAD_LETTER),
      };
    });
  }

  /** Aggregate counts for the Explorer overview dashboard. */
  async overview(workspaceId: string): Promise<ExplorerOverview> {
    const now = new Date();
    const [totalEvents, grouped, activeLeases] = await Promise.all([
      this.prisma.event.count({ where: { workspaceId } }),
      this.prisma.delivery.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.delivery.count({
        where: { workspaceId, status: DeliveryStatus.LEASED, leaseUntil: { gt: now } },
      }),
    ]);

    const countFor = (status: DeliveryStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;

    return {
      totalEvents,
      pending: countFor(DeliveryStatus.PENDING),
      activeLeases,
      retryScheduled: countFor(DeliveryStatus.RETRY_SCHEDULED),
      deadLetter: countFor(DeliveryStatus.DEAD_LETTER),
      acknowledged: countFor(DeliveryStatus.ACKNOWLEDGED),
    };
  }
}
