import type { PrismaClient } from '@triggers/database';

/** Administrative maintenance actions for the Explorer/demo. */
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly defaults: { maxAttempts: number; visibilityTimeoutSeconds: number },
  ) {}

  /**
   * Demo-safe reset for a single workspace: delete all events (which cascades to
   * deliveries, ack receipts, and replay audits) and normalize the workspace's
   * subscriptions back to defaults. Subscriptions and API keys are preserved, so
   * existing credentials keep working. Strictly tenant-scoped by workspaceId.
   */
  async resetWorkspace(workspaceId: string): Promise<{ eventsDeleted: number }> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.event.deleteMany({ where: { workspaceId } });
      await tx.subscription.updateMany({
        where: { workspaceId },
        data: {
          maxAttempts: this.defaults.maxAttempts,
          visibilityTimeoutSeconds: this.defaults.visibilityTimeoutSeconds,
          isActive: true,
        },
      });
      return { eventsDeleted: events.count };
    });
  }
}
