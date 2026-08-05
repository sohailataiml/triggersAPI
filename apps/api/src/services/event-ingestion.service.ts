import type { PrismaClient, Event } from '@triggers/database';
import { newId, Prisma } from '@triggers/database';
import { matchesSubscription } from '@triggers/domain';
import type { IngestEventInput, IngestEventResponse } from '@triggers/contracts';
import type { Metrics } from '@triggers/observability';
import type { ActivityService } from './activity.service.js';

export interface IngestResult {
  response: IngestEventResponse;
  /** Subscriptions that received a new delivery (used for post-commit wake-ups). */
  matchedSubscriptionIds: string[];
  eventId: string;
}

/** Handles durable event ingestion and synchronous subscription fan-out. */
export class EventIngestionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly activity: ActivityService,
    private readonly metrics: Metrics,
  ) {}

  async ingest(
    workspaceId: string,
    input: IngestEventInput,
    idempotencyKey: string | null,
  ): Promise<IngestResult> {
    // Fast path for a known duplicate idempotency key.
    if (idempotencyKey) {
      const existing = await this.prisma.event.findFirst({
        where: { workspaceId, idempotencyKey },
      });
      if (existing) {
        return this.duplicateResult(existing);
      }
    }

    const eventId = newId();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : null;

    // Active subscriptions for this workspace, filtered by the domain matcher.
    const subscriptions = await this.prisma.subscription.findMany({
      where: { workspaceId, isActive: true },
    });
    const matched = subscriptions.filter((sub) =>
      matchesSubscription(
        { source: input.source, eventType: input.eventType, subject: input.subject ?? null },
        {
          sourceFilter: sub.sourceFilter,
          eventTypeFilter: sub.eventTypeFilter,
          subjectFilter: sub.subjectFilter,
        },
      ),
    );

    let event: Event;
    try {
      event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            id: eventId,
            workspaceId,
            source: input.source,
            eventType: input.eventType,
            subject: input.subject ?? null,
            schemaVersion: input.schemaVersion ?? null,
            payload: input.payload as Prisma.InputJsonValue,
            metadata: input.metadata as Prisma.InputJsonValue,
            idempotencyKey,
            occurredAt,
          },
        });

        if (matched.length > 0) {
          await tx.delivery.createMany({
            data: matched.map((sub) => ({
              id: newId(),
              eventId: created.id,
              subscriptionId: sub.id,
              workspaceId,
            })),
          });
        }
        return created;
      });
    } catch (err) {
      // Concurrent duplicate: the partial unique index rejected the second insert.
      if (
        idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.event.findFirst({
          where: { workspaceId, idempotencyKey },
        });
        if (existing) return this.duplicateResult(existing);
      }
      throw err;
    }

    // Post-commit: metrics, activity, and wake-ups. Redis is best-effort here.
    this.metrics.eventsIngested.inc();
    this.metrics.deliveriesCreated.inc(matched.length);

    await this.activity.append({
      type: 'event.ingested',
      timestamp: new Date().toISOString(),
      workspaceId,
      eventId: event.id,
      summary: { source: input.source, eventType: input.eventType },
    });

    const matchedSubscriptionIds = matched.map((sub) => sub.id);
    for (const sub of matched) {
      await this.activity.append({
        type: 'delivery.created',
        timestamp: new Date().toISOString(),
        workspaceId,
        eventId: event.id,
        subscriptionId: sub.id,
        status: 'PENDING',
      });
      await this.activity.publishWakeup(sub.id);
    }

    return {
      response: {
        eventId: event.id,
        receivedAt: event.receivedAt.toISOString(),
        matchedSubscriptions: matched.length,
        status: 'accepted',
        duplicate: false,
      },
      matchedSubscriptionIds,
      eventId: event.id,
    };
  }

  private async duplicateResult(existing: Event): Promise<IngestResult> {
    this.metrics.eventsDuplicate.inc();
    const matchedSubscriptions = await this.prisma.delivery.count({
      where: { eventId: existing.id },
    });
    return {
      response: {
        eventId: existing.id,
        receivedAt: existing.receivedAt.toISOString(),
        matchedSubscriptions,
        status: 'accepted',
        duplicate: true,
      },
      matchedSubscriptionIds: [],
      eventId: existing.id,
    };
  }
}
