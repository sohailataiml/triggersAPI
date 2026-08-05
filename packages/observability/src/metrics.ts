import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/** All Prometheus metrics exposed by the platform, bound to one registry. */
export interface Metrics {
  registry: Registry;
  eventsIngested: Counter;
  eventsDuplicate: Counter;
  deliveriesCreated: Counter;
  deliveriesLeased: Counter;
  deliveriesAcknowledged: Counter;
  deliveriesNacked: Counter;
  deliveriesRetried: Counter;
  deliveriesDeadLettered: Counter;
  deliveriesReplayed: Counter;
  activeLeases: Gauge;
  pendingDeliveries: Gauge;
  longPollActive: Gauge;
  longPollWaitSeconds: Histogram;
  ingestionLatencySeconds: Histogram;
  ackLatencySeconds: Histogram;
  deliveryEndToEndSeconds: Histogram;
}

/**
 * Build the full metrics set on a fresh registry (or a supplied one).
 * Default Node process metrics are collected as well.
 */
export function createMetrics(register: Registry = new Registry()): Metrics {
  collectDefaultMetrics({ register });

  const counter = (name: string, help: string) =>
    new Counter({ name, help, registers: [register] });

  return {
    registry: register,
    eventsIngested: counter('triggers_events_ingested_total', 'Total events ingested'),
    eventsDuplicate: counter('triggers_events_duplicate_total', 'Total duplicate events'),
    deliveriesCreated: counter('triggers_deliveries_created_total', 'Total deliveries created'),
    deliveriesLeased: counter('triggers_deliveries_leased_total', 'Total deliveries leased'),
    deliveriesAcknowledged: counter(
      'triggers_deliveries_acknowledged_total',
      'Total deliveries acknowledged',
    ),
    deliveriesNacked: counter('triggers_deliveries_nacked_total', 'Total deliveries NACKed'),
    deliveriesRetried: counter('triggers_deliveries_retried_total', 'Total deliveries retried'),
    deliveriesDeadLettered: counter(
      'triggers_deliveries_dead_lettered_total',
      'Total deliveries dead-lettered',
    ),
    deliveriesReplayed: counter('triggers_deliveries_replayed_total', 'Total deliveries replayed'),
    activeLeases: new Gauge({
      name: 'triggers_active_leases',
      help: 'Currently active (unexpired) leases',
      registers: [register],
    }),
    pendingDeliveries: new Gauge({
      name: 'triggers_pending_deliveries',
      help: 'Deliveries currently available for lease',
      registers: [register],
    }),
    longPollActive: new Gauge({
      name: 'triggers_long_poll_active',
      help: 'Currently open long-poll requests',
      registers: [register],
    }),
    longPollWaitSeconds: new Histogram({
      name: 'triggers_long_poll_wait_seconds',
      help: 'Long-poll wait duration in seconds',
      buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10, 20, 30],
      registers: [register],
    }),
    ingestionLatencySeconds: new Histogram({
      name: 'triggers_ingestion_latency_seconds',
      help: 'Event ingestion handler latency in seconds',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [register],
    }),
    ackLatencySeconds: new Histogram({
      name: 'triggers_ack_latency_seconds',
      help: 'ACK handler latency in seconds',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [register],
    }),
    deliveryEndToEndSeconds: new Histogram({
      name: 'triggers_delivery_end_to_end_seconds',
      help: 'Time from event receipt to acknowledgment in seconds',
      buckets: [0.1, 0.5, 1, 5, 15, 60, 300, 900],
      registers: [register],
    }),
  };
}
