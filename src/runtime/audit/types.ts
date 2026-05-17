// Layer 1 — Runtime / Audit log types.
//
// Per spec §2.a.7: audit-log PROPOSED is durably written *before* the
// reversibility gate. This is load-bearing: a crash between gate and
// execution leaves a record that an action was about to run, which the audit
// log can reconcile against the COMPLETED record. No silent disappearances.
//
// The PoC uses an in-memory logger (no real durability) but respects the
// ordering invariant: PROPOSED is written before the gate is consulted;
// COMPLETED|FAILED is written after the developer method returns or throws.
// The interface is designed so a durable backend (Postgres, SQLite, etc.)
// can be dropped in without changing the registry's call sites.

export type AuditEventKind = "PROPOSED" | "COMPLETED" | "FAILED";

/**
 * One audit row. Always paired: every PROPOSED is followed by a COMPLETED
 * or FAILED (or a PauseForApproval terminal record — see `outcome`).
 */
export interface AuditEvent {
  readonly kind: AuditEventKind;
  readonly actionKey: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  /** Monotonic timestamp in milliseconds. */
  readonly tsMs: number;
  /**
   * Free-form per-event payload. PROPOSED carries a params summary,
   * COMPLETED a return summary, FAILED a cause summary, PAUSED an
   * approver-set summary.
   */
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * Audit logger interface. The PoC ships an in-memory implementation; a
 * durable backend (Postgres, SQLite, append-only file) drops in by
 * implementing this same shape. The registry only calls these two methods.
 */
export interface AuditLogger {
  /**
   * Write a single audit event. Must be synchronous from the registry's
   * point of view (no `await` in the gate sequence between PROPOSED and the
   * reversibility gate); a durable backend with async I/O wraps the call in
   * its own queue or batches behind this synchronous facade. The PoC's
   * in-memory logger is naturally synchronous.
   */
  write(event: AuditEvent): void;
  /** Read all events. PoC-only; durable backends would use a query API. */
  readonly events: ReadonlyArray<AuditEvent>;
}
