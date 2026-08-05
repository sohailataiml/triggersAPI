/**
 * Version 1 subscription filter matching.
 * A null/undefined filter is a wildcard. A non-null filter must match exactly.
 */
export interface EventMatchInput {
  source: string;
  eventType: string;
  subject: string | null;
}

export interface SubscriptionFilters {
  sourceFilter: string | null;
  eventTypeFilter: string | null;
  subjectFilter: string | null;
}

function fieldMatches(filter: string | null, value: string | null): boolean {
  if (filter === null || filter === undefined) {
    return true; // wildcard
  }
  return filter === value;
}

/** Returns true when the event satisfies every non-wildcard filter. */
export function matchesSubscription(event: EventMatchInput, filters: SubscriptionFilters): boolean {
  return (
    fieldMatches(filters.sourceFilter, event.source) &&
    fieldMatches(filters.eventTypeFilter, event.eventType) &&
    fieldMatches(filters.subjectFilter, event.subject)
  );
}
