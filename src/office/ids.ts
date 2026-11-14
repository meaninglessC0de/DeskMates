import { ulid } from 'ulid';

export type IdPrefix = 'emp' | 'msg' | 'tsk' | 'apr' | 'evt' | 'call';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}
