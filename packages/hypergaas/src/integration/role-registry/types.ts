// Layer 4 — SaaS Integration / Role registry types (v0.1 PUBLIC surface).
//
// This is the v0.1 public surface for the role-typing primitives. It mirrors
// and absorbs `domains/engineering/decisions/role-registry.md` (founder-approved
// 2026-05-15, locked for v0.1) and `sdk/docs/specs/action-registry.md` §6.a.
//
// Locked invariant (CONSTITUTION § Hard nos): NO `any` in this surface.
// `audienceRoles` is NOT `string[]`; it is a typed list of literal role keys
// drawn from the developer's role registry (`RoleOf<R>`) plus predicate
// audiences (`AudiencePredicate<P>`). The whole point of exporting
// `AudiencePredicate<P>` (approved.jsonl line 6) is to let developers author
// their own predicate factories WITHOUT a cast-through-`any` escape hatch.

import type { AgentContext } from "../../runtime/context/types.js";

/**
 * Per-tenant autonomy level. Re-exported as part of the public surface so
 * developers can type their own tenant-config plumbing against the same union.
 * Drives the reversibility gate (spec §5.a): `irreversible` actions proceed at
 * "high", otherwise pause for approval.
 */
export type AutonomyLevel = "low" | "medium" | "high";

/**
 * Configuration for a single role in the app's role registry.
 *
 * Per `role-registry.md` § "Runtime semantics the metadata unlocks", every
 * field is load-bearing for a runtime subsystem — this is a registry, not
 * decoration. (spec §6.b maps each field to its consuming subsystem.)
 */
export interface RoleConfig {
  /** Rendered in the approval inbox + audit-log UI. Single source of truth;
   *  no hand-string-formatting at render time. */
  displayName: string;
  /** Numeric ordering for the "approver seniority >= proposer seniority" rule
   *  the approval system enforces. */
  seniority: number;
  /** Whether a user with this role may run agents on behalf of other tenant
   *  users (gates `createAgentContext(tenantId, onBehalfOfUserId)`). */
  canImpersonate?: boolean;
  /** Highest gate level this role can clear when approving irreversible
   *  actions. Read by the workflow engine's reversibility gate (spec §5.b). */
  canApproveIrreversibleUpTo?: AutonomyLevel;
  /** Per-day soft cap on agent spend attributed to this role. Read by the cost
   *  subsystem (spec §6.b); the subsystem itself lands separately, but the
   *  field is here so it can drop in without a public-surface change. */
  maxAgentSpendPerDayCents?: number;
}

/**
 * A role registry: a map of literal role keys to their config. The developer
 * defines one once via `defineRoles({...})`. The literal keys become the
 * `RoleOf<R>` string-literal union that types `audienceRoles`.
 */
export type RoleRegistry = Record<string, RoleConfig>;

/**
 * Type utility — extracts the role-key string-literal union from a registry.
 *
 * `RoleOf<typeof ForgeProRoles>` = `'owner' | 'dispatcher' | 'csr' | 'technician'`.
 * `keyof R & string` drops symbol/number keys, which a `Record<string, _>`
 * literal never has but the intersection makes the union provably `string`.
 *
 * This is what gives full autocomplete, refactor-rename, and compile-time
 * typo prevention on `audienceRoles` — the entire reason for the registry
 * over a `string[]` (`role-registry.md` § "Why a registry, not a TS enum").
 */
export type RoleOf<R> = keyof R & string;

/**
 * A predicate audience entry — for dynamic relationships like "self" that are
 * a relationship, not a static role (`role-registry.md` § "The `self` case is
 * a relationship, not a role").
 *
 * EXPORTED as public surface in v0.1 (approved.jsonl line 6, decision:
 * "export AudiencePredicate<P> as public surface in v0.1"). Without this
 * export, a developer needing a predicate the SDK doesn't ship (e.g.
 * "same account manager as the customer") would have to cast through `any`
 * to construct one — which violates the no-`any`-in-public-surface invariant.
 * Exporting the type is the small surface-area cost that keeps the escape
 * hatch closed.
 *
 * Generic over `P` (the action's params type) so `check` receives `params`
 * typed exactly as the action declares them — no `any`, no widening.
 */
export interface AudiencePredicate<P> {
  readonly kind: "predicate";
  /** Recorded in the audit log when this predicate matches
   *  (e.g. "self: tech viewing own schedule"). */
  readonly label: string;
  check(ctx: AgentContext, params: P): boolean;
}

/**
 * A single audience entry: either a static registry role key, or a predicate.
 * Generic over both the app's role registry `R` and the action's params `P`.
 *
 * `RoleOf<R>` narrows the string side from raw `string` to the registry's
 * literal keys — this is the narrowing that the internal PoC form
 * (`string | AudiencePredicate<P>`) is the strict superset of. (ADR staging
 * table: "the public form is a narrowing of the string side to `RoleOf<R>`".)
 */
export type Audience<R extends RoleRegistry, P> =
  | RoleOf<R>
  | AudiencePredicate<P>;
