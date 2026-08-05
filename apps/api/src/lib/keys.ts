/** Central definitions for Redis channel and stream key names. */

export function wakeupChannel(subscriptionId: string): string {
  return `triggers:wakeup:${subscriptionId}`;
}

export const EXPLORER_ACTIVITY_STREAM = 'triggers:explorer:activity';

export function longPollCounterKey(publicPrefix: string): string {
  return `triggers:longpoll:count:${publicPrefix}`;
}
