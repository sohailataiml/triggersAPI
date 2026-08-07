// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyContext, contextFromToolResult, emptyContext } from '../src/context.js';

const EVENT = '0198c1f0-0000-7000-8000-000000000002';
const DELIVERY = '0198c1f0-0000-7000-8000-000000000003';
const SUBSCRIPTION = '0198c1f0-0000-7000-8000-000000000001';

describe('conversation context', () => {
  it('selects the ingested event', () => {
    expect(contextFromToolResult('ingest_event', { eventId: EVENT, duplicate: false })).toEqual({
      selectedEventId: EVENT,
    });
  });

  it('selects a single leased delivery', () => {
    const update = contextFromToolResult('lease_deliveries', {
      count: 1,
      items: [{ deliveryId: DELIVERY, eventId: EVENT }],
    });

    expect(update).toEqual({ selectedDeliveryId: DELIVERY, selectedEventId: EVENT });
  });

  it('refuses to pick a target when a lease returns several deliveries', () => {
    const update = contextFromToolResult('lease_deliveries', {
      count: 2,
      items: [{ deliveryId: DELIVERY }, { deliveryId: 'other' }],
    });

    // Ambiguity must reach the model as ambiguity, so it asks rather than guesses.
    expect(update).toEqual({});
  });

  it('refuses to pick a target from a multi-result dead-letter list', () => {
    const update = contextFromToolResult('list_deliveries', {
      count: 3,
      items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });

    expect(update).toEqual({});
  });

  it('adopts the only delivery in a single-result list', () => {
    const update = contextFromToolResult('list_deliveries', {
      count: 1,
      items: [{ id: DELIVERY, eventId: EVENT }],
    });

    expect(update).toEqual({ selectedDeliveryId: DELIVERY, selectedEventId: EVENT });
  });

  it('captures every id from a delivery detail', () => {
    expect(
      contextFromToolResult('get_delivery', {
        id: DELIVERY,
        eventId: EVENT,
        subscriptionId: SUBSCRIPTION,
      }),
    ).toEqual({
      selectedDeliveryId: DELIVERY,
      selectedEventId: EVENT,
      selectedSubscriptionId: SUBSCRIPTION,
    });
  });

  it('tracks a newly created subscription', () => {
    expect(contextFromToolResult('create_subscription', { id: SUBSCRIPTION })).toEqual({
      selectedSubscriptionId: SUBSCRIPTION,
    });
  });

  it('ignores read-only tools that imply no selection', () => {
    expect(contextFromToolResult('get_overview', { totalEvents: 12 })).toEqual({});
  });

  it('merges updates without clearing unrelated selections', () => {
    const base = applyContext(emptyContext(), { selectedSubscriptionId: SUBSCRIPTION });
    const next = applyContext(base, { selectedEventId: EVENT });

    expect(next).toEqual({
      selectedEventId: EVENT,
      selectedDeliveryId: null,
      selectedSubscriptionId: SUBSCRIPTION,
    });
  });
});
