// Layer 1 — Runtime / In-memory audit logger.
//
// PoC implementation. Respects the ordering invariant (writes are append-only
// in call order) but does not persist. A durable backend implements the same
// AuditLogger interface and is dropped in via constructor injection at the
// registry's seam.

import type { AuditEvent, AuditLogger } from "./types.js";

export class InMemoryAuditLogger implements AuditLogger {
  readonly #events: AuditEvent[] = [];

  write(event: AuditEvent): void {
    this.#events.push(event);
  }

  get events(): ReadonlyArray<AuditEvent> {
    return this.#events;
  }

  /** Test helper — not a public API. */
  clear(): void {
    this.#events.length = 0;
  }
}
