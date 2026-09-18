import { outboxEvents } from "@/db/schema";
import type { Tx } from "@/db/tx";
import { EVENT_VERSION, type AggregateType, type DomainEvent } from "@/lib/events";
import type { JsonObject } from "@/types/json";

export interface OutboxEventInput {
  eventType: DomainEvent;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: JsonObject;
  availableAt?: Date;
}

/**
 * Enqueues outbox events inside the caller's transaction (§10). The event
 * exists if and only if the business fact exists. The event row's id is the
 * deterministic delivery key passed to providers for their own idempotency.
 */
export async function enqueueOutboxEvents(tx: Tx, events: OutboxEventInput[]): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(outboxEvents).values(
    events.map((event) => ({
      eventType: event.eventType,
      eventVersion: EVENT_VERSION,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      availableAt: event.availableAt ?? new Date(),
    })),
  );
}
