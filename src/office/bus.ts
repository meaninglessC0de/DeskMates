import type { ServerEvent } from '../shared/index.ts';

type Listener = (e: ServerEvent) => void;

export class Bus {
  private listeners = new Set<Listener>();

  emit(e: ServerEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch {
        /* a broken listener must not stop the others */
      }
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
