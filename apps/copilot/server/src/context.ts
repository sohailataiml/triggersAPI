/**
 * Lightweight conversation context so references like "ack it" or "replay that
 * one" resolve safely.
 *
 * Only non-sensitive identifiers are tracked — never tokens, payloads, or
 * credentials — and a target is adopted only when it is *unambiguous*. A list
 * that returns five dead letters selects nothing, which is what forces the
 * model to ask which one rather than guessing.
 */

export interface SessionContext {
  selectedEventId: string | null;
  selectedDeliveryId: string | null;
  selectedSubscriptionId: string | null;
}

export function emptyContext(): SessionContext {
  return { selectedEventId: null, selectedDeliveryId: null, selectedSubscriptionId: null };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Derive context updates from one tool result. Returns only the fields that
 * changed, so an unrelated call never clears an existing selection.
 */
export function contextFromToolResult(toolName: string, result: unknown): Partial<SessionContext> {
  const data = asRecord(result);
  if (!data) return {};

  switch (toolName) {
    case 'ingest_event': {
      const eventId = str(data.eventId);
      return eventId ? { selectedEventId: eventId } : {};
    }

    case 'lease_deliveries': {
      const items = Array.isArray(data.items) ? data.items : [];
      // Exactly one leased delivery is an unambiguous "current delivery".
      if (items.length !== 1) return {};
      const item = asRecord(items[0]);
      if (!item) return {};
      const update: Partial<SessionContext> = {};
      const deliveryId = str(item.deliveryId);
      const eventId = str(item.eventId);
      if (deliveryId) update.selectedDeliveryId = deliveryId;
      if (eventId) update.selectedEventId = eventId;
      return update;
    }

    case 'ack_delivery':
    case 'nack_delivery':
    case 'replay_delivery': {
      const deliveryId = str(data.deliveryId);
      return deliveryId ? { selectedDeliveryId: deliveryId } : {};
    }

    case 'get_delivery': {
      const update: Partial<SessionContext> = {};
      const deliveryId = str(data.id);
      const eventId = str(data.eventId);
      const subscriptionId = str(data.subscriptionId);
      if (deliveryId) update.selectedDeliveryId = deliveryId;
      if (eventId) update.selectedEventId = eventId;
      if (subscriptionId) update.selectedSubscriptionId = subscriptionId;
      return update;
    }

    case 'create_subscription':
    case 'update_subscription':
    case 'get_subscription': {
      const subscriptionId = str(data.id);
      return subscriptionId ? { selectedSubscriptionId: subscriptionId } : {};
    }

    case 'list_deliveries':
    case 'list_events': {
      // A single-result list is unambiguous; anything else must be
      // disambiguated by the user, so select nothing.
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length !== 1) return {};
      const item = asRecord(items[0]);
      if (!item) return {};
      const update: Partial<SessionContext> = {};
      if (toolName === 'list_deliveries') {
        const deliveryId = str(item.id);
        const eventId = str(item.eventId);
        if (deliveryId) update.selectedDeliveryId = deliveryId;
        if (eventId) update.selectedEventId = eventId;
      } else {
        const eventId = str(item.id);
        if (eventId) update.selectedEventId = eventId;
      }
      return update;
    }

    default:
      return {};
  }
}

export function applyContext(
  current: SessionContext,
  update: Partial<SessionContext>,
): SessionContext {
  return { ...current, ...update };
}
