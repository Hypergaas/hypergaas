// Layer 1 — Runtime / Action registry types.
//
// PoC scope per spec §8.a: `audienceRoles` is the internal raw-string form.
// The v0.1 public-type-surface commit replaces this with the registry-aware
// generic-over-R form (RoleOf<R>) — that commit is approve-tier and is not
// today's work.

import type { AgentContext } from "../context/types.js";

export type Reversibility = "idempotent" | "reversible" | "irreversible";

/**
 * Predicate-form audience entry. Carries a label so the audit log can
 * record which predicate matched (spec §6.c).
 *
 * The PoC's internal shape is generic over the params type so a developer
 * can write `selfAudience<{ techId: string }>(...)` and still get full
 * typing on `params` inside the predicate body. The v0.1 public surface
 * derives `params` from the action's `P` via the decorator; we replicate
 * the relationship-vs-role distinction here.
 */
export interface AudiencePredicate<P = unknown> {
  readonly kind: "predicate";
  readonly label: string;
  check(ctx: AgentContext, params: P): boolean;
}

/**
 * Internal raw-string entry: either a literal role key (string) or a
 * predicate. Per spec §8.a, the PoC's internal form is `string` rather
 * than the registry-aware `RoleOf<R>`.
 */
export type AudienceEntryInternal<P = unknown> = string | AudiencePredicate<P>;

/**
 * Internal `@agentAction()` options. Mirrors the v0.1 public shape from
 * spec §1, but with `audienceRoles` widened to raw strings + predicates per
 * §8.a staging. The other fields match the public surface 1:1 so the
 * migration to the public form is a narrowing of one field type — not a
 * structural rewrite.
 */
export interface AgentActionOptionsInternal<P = unknown> {
  readonly description: string;
  readonly reversibility: Reversibility;
  readonly requiredPermissions: readonly string[];
  readonly audienceRoles: ReadonlyArray<AudienceEntryInternal<P>>;
  readonly costWeight: number;
  /** Override the default ClassName.methodName action key. */
  readonly actionKey?: string;
}

/**
 * Internal descriptor — what the registry stores per action.
 *
 * `invoke` is the type-erased thunk the registry calls after gates pass.
 * Keeping it `unknown`-in / `unknown`-out at the descriptor boundary lets
 * the registry remain a single map regardless of each action's `P` and
 * return type. The decorator preserves typing at the developer-facing
 * surface; the descriptor is the runtime's internal seam.
 */
export interface ActionDescriptor {
  readonly key: string;
  readonly className: string;
  readonly methodName: string;
  readonly options: AgentActionOptionsInternal<unknown>;
  /** Bound to the instance at decoration time. */
  invoke(ctx: AgentContext, params: unknown): Promise<unknown>;
}
