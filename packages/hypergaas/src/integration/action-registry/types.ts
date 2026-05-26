// Layer 4 — SaaS Integration / Action-registry PUBLIC types (v0.1 surface).
//
// The registry-aware `@agentAction()` public type signature: generic over the
// app's role registry `R` AND the action's params `P`. There is NO `string[]`
// overload anywhere in this surface (spec §1 § "Hard no's at the type level";
// `role-registry.md` § "What this rules out for v0.1").
//
// Locked invariant (CONSTITUTION § Hard nos): no `any` in the public surface.

import type { AgentContext } from "../../runtime/context/types.js";
import type { Reversibility } from "../../runtime/action-registry/types.js";
import type { Audience, RoleRegistry } from "../role-registry/types.js";

export type { Reversibility } from "../../runtime/action-registry/types.js";
export type { AutonomyLevel } from "../role-registry/types.js";

/**
 * Public options for `@agentAction()`. Generic over both the app's role
 * registry `R` and the action's parameter type `P`.
 *
 * Mirrors spec §1 `AgentActionOptions`. The internal PoC form
 * (`AgentActionOptionsInternal<P>`) is the same shape with `audienceRoles`
 * widened to raw `string | AudiencePredicate<P>`; the public form below is the
 * narrowing of the string side to `RoleOf<R>` via `Audience<R, P>`.
 */
export interface AgentActionOptions<R extends RoleRegistry, P> {
  /** Human-readable description; surfaces in the tool schema and audit log.
   *  Mandatory — tool schemas without descriptions degrade model performance
   *  (spec §1 § "Hard no's": `description?` is banned). */
  readonly description: string;
  /** Reversibility class — drives the workflow engine's autonomy gate. */
  readonly reversibility: Reversibility;
  /** Permission strings the calling user must hold (RBAC, app-defined).
   *  Always a list; the single-string form is banned (spec §1). */
  readonly requiredPermissions: readonly string[];
  /** Who may invoke this action. Typed against the app's role registry `R`:
   *  static role keys are `RoleOf<R>` (a typo is a compile error) and dynamic
   *  relationships are `AudiencePredicate<P>` (params typed as the action's). */
  readonly audienceRoles: ReadonlyArray<Audience<R, P>>;
  /** Cost-attribution weight (multiplier on per-call accounting). */
  readonly costWeight: number;
  /** Optional override for the action key; defaults to ClassName.methodName. */
  readonly actionKey?: string;
}

/**
 * The registry-aware decorator factory. Generic over `R` at the registry
 * binding (via `createActionRegistry(roles)`); generic over `P` and `T` at
 * each decoration site so `params` and `this` are inferred from the method.
 *
 * Returns a TC39 stage-3 `ClassMethodDecoratorContext` method decorator. The
 * `target` signature requires `(this, ctx: AgentContext, params: P)` — a
 * method without a leading `ctx` fails to decorate (spec §4 type-level
 * bypass defense).
 */
export type AgentActionDecorator<R extends RoleRegistry> = <P, T>(
  options: AgentActionOptions<R, P>,
) => (
  target: (this: T, ctx: AgentContext, params: P) => Promise<unknown>,
  context: ClassMethodDecoratorContext<
    T,
    (this: T, ctx: AgentContext, params: P) => Promise<unknown>
  >,
) => void;
