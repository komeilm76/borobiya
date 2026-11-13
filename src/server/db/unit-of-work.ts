import type { WebSocketHub } from '../core/websocket.ts';
import type { RealtimeEvent } from '../../shared/protocol.ts';
import type { Repository } from './repository.ts';

/** A single committed unit of work: SQLite transaction + events published after commit. */
export interface Transaction {
  readonly repo: Repository;
  event(type: string, payload: unknown, audience: string[]): RealtimeEvent;
}

/**
 * One boundary for every state-changing use case:
 * SQLite transaction -> durable event rows -> socket publication after commit.
 * A failed transaction publishes nothing; a committed transaction publishes exactly once.
 */
export class UnitOfWork {
  constructor(
    private readonly repo: Repository,
    private readonly hub: WebSocketHub
  ) {}

  commit<T>(operation: (tx: Transaction) => T): T {
    const events: RealtimeEvent[] = [];
    const repository = this.repo;
    const result = repository.transaction(() => {
      const tx: Transaction = {
        repo: repository,
        event(type, payload, audience) {
          const event = repository.appendEvent(type, payload, audience);
          events.push(event);
          return event;
        }
      };
      return operation(tx);
    });
    for (const event of events) this.hub.publish(event);
    return result;
  }
}
