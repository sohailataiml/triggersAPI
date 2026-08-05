-- CreateEnum
CREATE TYPE "ApiKeyRole" AS ENUM ('PRODUCER', 'CONSUMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'LEASED', 'RETRY_SCHEDULED', 'ACKNOWLEDGED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "ApiKeyRole" NOT NULL,
    "name" TEXT NOT NULL,
    "publicPrefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "subscriptionId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "subject" TEXT,
    "eventType" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sourceFilter" TEXT,
    "eventTypeFilter" TEXT,
    "subjectFilter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "visibilityTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedAt" TIMESTAMPTZ(6),
    "leaseUntil" TIMESTAMPTZ(6),
    "leaseTokenHash" TEXT,
    "consumerInstanceId" TEXT,
    "acknowledgedAt" TIMESTAMPTZ(6),
    "deadLetteredAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ack_receipts" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "consumerProcessId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ack_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_audits" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT,
    "previousStatus" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_publicPrefix_key" ON "api_keys"("publicPrefix");

-- CreateIndex
CREATE INDEX "api_keys_workspaceId_role_idx" ON "api_keys"("workspaceId", "role");

-- CreateIndex
CREATE INDEX "events_workspaceId_receivedAt_idx" ON "events"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "events_workspaceId_source_eventType_idx" ON "events"("workspaceId", "source", "eventType");

-- CreateIndex
CREATE INDEX "subscriptions_workspaceId_isActive_idx" ON "subscriptions"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "deliveries_subscriptionId_status_availableAt_idx" ON "deliveries"("subscriptionId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "deliveries_status_leaseUntil_idx" ON "deliveries"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "deliveries_workspaceId_status_idx" ON "deliveries"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_eventId_subscriptionId_key" ON "deliveries"("eventId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ack_receipts_deliveryId_consumerProcessId_key" ON "ack_receipts"("deliveryId", "consumerProcessId");

-- CreateIndex
CREATE INDEX "replay_audits_deliveryId_idx" ON "replay_audits"("deliveryId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ack_receipts" ADD CONSTRAINT "ack_receipts_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_audits" ADD CONSTRAINT "replay_audits_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index enforcing producer-side idempotency.
-- Prisma cannot express a partial index declaratively, so it is added here.
CREATE UNIQUE INDEX "events_workspaceId_idempotencyKey_key"
    ON "events" ("workspaceId", "idempotencyKey")
    WHERE "idempotencyKey" IS NOT NULL;
