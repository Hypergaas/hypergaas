// Layer 4 — SaaS Integration / defineRoles + audience predicate constructors
// (v0.1 PUBLIC surface). Per `role-registry.md` § "Public API shape (v0.1)"
// and spec §6.a.

import type { AgentContext } from "../../runtime/context/types.js";
import type {
  AudiencePredicate,
  RoleConfig,
  RoleRegistry,
} from "./types.js";

/**
 * SDK-exported registry constructor. Returns the registry **as-is** —
 * identity at runtime — so the literal type is preserved for
 * `RoleOf<typeof X>` derivation downstream. The generic constraint
 * `R extends Record<string, RoleConfig>` validates the config shape at the
 * call site while keeping the literal key union inferable.
 *
 * Why a function that returns its argument rather than a no-op the developer
 * could skip: the `R extends Record<string, RoleConfig>` bound is what
 * type-checks each entry's config (a typo in `seniority`, a missing
 * `displayName`) at the point of definition, and the explicit constructor is
 * the single, opinionated, ergonomic SDK surface for "define your roles once"
 * (`role-registry.md` § "Why a registry, not a TS enum").
 *
 * @example
 * export const ForgeProRoles = defineRoles({
 *   owner: { displayName: "Owner", seniority: 4, canApproveIrreversibleUpTo: "high" },
 *   dispatcher: { displayName: "Dispatcher", seniority: 3 },
 * });
 * export type ForgeProRole = RoleOf<typeof ForgeProRoles>;
 * //          ^? 'owner' | 'dispatcher'
 */
export function defineRoles<R extends RoleRegistry>(registry: R): R {
  return registry;
}

/**
 * Predicate-audience constructors. Opinionated and small — adding a new flavor
 * (e.g. `audience.sameRegion(...)`) is an additive SDK change, not a
 * developer-side ad-hoc lambda free-for-all (`role-registry.md` § "The `self`
 * case is a relationship, not a role").
 *
 * `self` is the only flavor in v0.1; `sameTeam`/`sameRegion` are deferred
 * additive future work (`role-registry.md` § "Open questions deferred past
 * v0.1").
 *
 * Generic over `P`: the `check` callback receives `params` typed exactly as
 * the action declares them. A developer who needs a predicate the SDK does not
 * ship constructs an `AudiencePredicate<P>` directly (the type is exported) —
 * no cast-through-`any`.
 */
export const audience = {
  /**
   * Construct a `self`-style audience predicate — passes when the calling
   * user stands in some dynamic relationship to the action's params (the
   * canonical case: a technician viewing their *own* schedule).
   *
   * @param check  Returns `true` if `ctx` is permitted given `params`.
   * @param label  Audit-log label; defaults to `"self"`.
   */
  self<P>(
    check: (ctx: AgentContext, params: P) => boolean,
    label = "self",
  ): AudiencePredicate<P> {
    return { kind: "predicate", label, check };
  },
} as const;
