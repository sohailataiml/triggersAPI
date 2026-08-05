import { uuidv7 } from 'uuidv7';

/**
 * Generate a UUIDv7 identifier. UUIDv7 embeds a millisecond timestamp in its
 * high bits, giving time-ordered, index-friendly primary keys.
 */
export function newId(): string {
  return uuidv7();
}
