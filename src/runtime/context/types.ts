// Layer 1 — Runtime / AgentContext types.
//
// Per spec §4: AgentContext is the only authoritative source of tenant
// identity inside an action body. The PoC enforces the runtime construction
// invariants (non-empty tenantId, frozen result) and the type-level invariant
// (every action body's first param is `ctx: AgentContext`).
//
// Three layers of bypass defense per spec §4:
//   1. Type level — the decorator's target signature requires (ctx, params).
//   2. Runtime construction — createAgentContext validates + freezes.
//   3. Invocation — registry.invoke is internal; no invokeAs(fakeCtx) surface.

export type AutonomyLevel = "low" | "medium" | "high";

/**
 * Per-invocation runtime object passed to every action body.
 *
 * `readonly` everywhere because the object is frozen at construction. Any
 * attempt by developer code to mutate raises in dev (frozen-object throws on
 * write in strict mode); is a no-op in non-strict. The freeze plus the
 * `readonly` types together provide both compile-time and runtime defense.
 *
 * Cross-ref: spec §4 "Why it cannot be bypassed".
 */
export interface AgentContext {
  readonly tenantId: string;
  readonly userId: string;
  /**
   * The role of the user as a raw string. The v0.1 public API surface narrows
   * this to `RoleOf<R>` when the role registry is bound; the PoC uses raw
   * strings internally per spec §8.a staging.
   */
  readonly role: string;
  /**
   * Permissions the user holds (RBAC, app-defined). The SDK does not own
   * permission storage; this is what the developer's existing RBAC layer
   * resolves and hands to the SDK.
   */
  readonly permissions: readonly string[];
  /**
   * Per-tenant autonomy level. Drives the reversibility gate per spec §5.a:
   * `irreversible` actions proceed when "high", otherwise pause for approval.
   */
  readonly tenant: {
    readonly autonomyLevel: AutonomyLevel;
  };
}

/** Constructor input — the public shape of `createAgentContext`. */
export interface CreateAgentContextInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly permissions: readonly string[];
  readonly autonomyLevel: AutonomyLevel;
}
