/**
 * Fan-out of committed domain events (B5). One process today, so the adapter is
 * in-memory; a second API instance needs a Redis pub/sub adapter behind this
 * same interface, and nothing else changes.
 */
export interface DomainEvent {
  id: number;
  topic: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  subscribe(handler: EventHandler): () => void;
}
