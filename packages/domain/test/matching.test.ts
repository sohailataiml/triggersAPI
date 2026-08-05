import { describe, expect, it } from 'vitest';
import { matchesSubscription } from '../src/matching.js';

const event = { source: 'github', eventType: 'pull_request.opened', subject: 'repo:acme/widgets' };

describe('matchesSubscription', () => {
  it('matches when all non-null filters equal the event fields', () => {
    expect(
      matchesSubscription(event, {
        sourceFilter: 'github',
        eventTypeFilter: 'pull_request.opened',
        subjectFilter: null,
      }),
    ).toBe(true);
  });

  it('treats null filters as wildcards', () => {
    expect(
      matchesSubscription(event, {
        sourceFilter: null,
        eventTypeFilter: null,
        subjectFilter: null,
      }),
    ).toBe(true);
  });

  it('rejects when a non-null filter does not match', () => {
    expect(
      matchesSubscription(event, {
        sourceFilter: 'gitlab',
        eventTypeFilter: null,
        subjectFilter: null,
      }),
    ).toBe(false);
  });

  it('rejects a subject filter when the event subject is null', () => {
    expect(
      matchesSubscription(
        { source: 'stripe', eventType: 'charge.succeeded', subject: null },
        { sourceFilter: null, eventTypeFilter: null, subjectFilter: 'customer:42' },
      ),
    ).toBe(false);
  });
});
