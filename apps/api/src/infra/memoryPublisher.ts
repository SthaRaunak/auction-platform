import type { DomainEvent, EventHandler, EventPublisher } from '../ports/eventPublisher';

export function createMemoryPublisher(): EventPublisher {
  const handlers = new Set<EventHandler>();
  return {
    async publish(event: DomainEvent) {
      for (const h of handlers) {
        try {
          await h(event);
        } catch (err) {
          console.error(`[events] handler failed for ${event.topic}#${event.id}`, err);
        }
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
