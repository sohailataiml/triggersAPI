import type { PrismaClient, Subscription } from '@triggers/database';
import { newId } from '@triggers/database';
import {
  NotFoundError,
  type CreateSubscriptionInput,
  type SubscriptionResponse,
  type UpdateSubscriptionInput,
} from '@triggers/contracts';
import type { AppConfig } from '@triggers/config';

function toResponse(sub: Subscription): SubscriptionResponse {
  return {
    id: sub.id,
    name: sub.name,
    filters: {
      source: sub.sourceFilter,
      eventType: sub.eventTypeFilter,
      subject: sub.subjectFilter,
    },
    isActive: sub.isActive,
    visibilityTimeoutSeconds: sub.visibilityTimeoutSeconds,
    maxAttempts: sub.maxAttempts,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  };
}

/** CRUD for subscriptions, always scoped to a workspace. */
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
  ) {}

  async create(workspaceId: string, input: CreateSubscriptionInput): Promise<SubscriptionResponse> {
    const sub = await this.prisma.subscription.create({
      data: {
        id: newId(),
        workspaceId,
        name: input.name,
        sourceFilter: input.filters.source ?? null,
        eventTypeFilter: input.filters.eventType ?? null,
        subjectFilter: input.filters.subject ?? null,
        visibilityTimeoutSeconds:
          input.visibilityTimeoutSeconds ?? this.config.DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
        maxAttempts: input.maxAttempts ?? this.config.DEFAULT_MAX_ATTEMPTS,
      },
    });
    return toResponse(sub);
  }

  async list(workspaceId: string): Promise<SubscriptionResponse[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return subs.map(toResponse);
  }

  async get(workspaceId: string, id: string): Promise<SubscriptionResponse> {
    const sub = await this.prisma.subscription.findFirst({ where: { id, workspaceId } });
    if (!sub) throw new NotFoundError('Subscription not found');
    return toResponse(sub);
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateSubscriptionInput,
  ): Promise<SubscriptionResponse> {
    // Scope the update by workspace to prevent cross-tenant mutation.
    const existing = await this.prisma.subscription.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundError('Subscription not found');

    const sub = await this.prisma.subscription.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        sourceFilter: input.filters ? (input.filters.source ?? null) : undefined,
        eventTypeFilter: input.filters ? (input.filters.eventType ?? null) : undefined,
        subjectFilter: input.filters ? (input.filters.subject ?? null) : undefined,
        visibilityTimeoutSeconds: input.visibilityTimeoutSeconds ?? undefined,
        maxAttempts: input.maxAttempts ?? undefined,
        isActive: input.isActive ?? undefined,
      },
    });
    return toResponse(sub);
  }
}
