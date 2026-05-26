// Layer 4 — SaaS Integration / createActionRegistry (v0.1 PUBLIC surface).
//
// The one-time SDK init step that binds the developer's role registry to the
// `@agentAction()` decorator. This binding is what makes the no-`string[]`
// invariant ACHIEVABLE: a free-floating `agentAction` can't infer `R` from
// nothing and would collapse `audienceRoles` to `string[]` (spec §1 § "Why
// this shape"; `single-registry-many-contexts.md`).
//
// Multi-tenancy is a property of `AgentContext`, NOT of the registry
// (`single-registry-many-contexts.md`): `createActionRegistry` takes roles +
// deps, never a tenant. One registry instance serves every tenant; the tenant
// boundary lives on the `ctx` passed to `invoke`. The public registry exposes
// exactly { agentAction, invoke, get, list } — there is deliberately no
// `forTenant` / `partition` key.

import type { AgentContext } from "../../runtime/context/types.js";
import type { AuditLogger } from "../../runtime/audit/types.js";
import type { ActionError, Result } from "../../runtime/result/types.js";
import { InMemoryAuditLogger } from "../../runtime/audit/in-memory-audit-logger.js";
import {
  ActionRegistry as InternalActionRegistry,
  type RoleConfigEntry,
  type RoleConfigMap,
} from "../../runtime/action-registry/registry.js";
import { createAgentActionDecorator } from "../../runtime/action-registry/agent-action.js";
import type {
  ActionDescriptor,
  AgentActionOptionsInternal,
} from "../../runtime/action-registry/types.js";
import type { RoleRegistry } from "../role-registry/types.js";
import type { AgentActionDecorator, AgentActionOptions } from "./types.js";

/**
 * Dependencies for a bound action registry. All optional — sensible v0.1
 * defaults (an in-memory audit logger) let a developer get a working
 * tenant-scoped invocation in the 5-minute quickstart without wiring a
 * durable backend first.
 */
export interface CreateActionRegistryOptions {
  /** Audit logger. Defaults to `InMemoryAuditLogger` — swap for a durable
   *  backend (Postgres/SQLite) behind the same `AuditLogger` interface. */
  readonly auditLogger?: AuditLogger;
  /** Optional clock for deterministic tests. */
  readonly nowMs?: () => number;
}

/**
 * The bound, registry-aware action registry returned by
 * `createActionRegistry(roles)`. Public surface = the decorator plus the four
 * runtime-facing methods. Generic over `R` so `agentAction`'s `audienceRoles`
 * is typed `Audience<R, P>[]`.
 *
 * Exactly four runtime keys beyond `agentAction` — `invoke`, `get`, `list`
 * (and the implicit construction). A fifth key that scopes by tenant would
 * relocate the multi-tenant invariant into the wrong abstraction; adding one
 * is a `notify`, not a unilateral edit (`single-registry-many-contexts.md`
 * rule 1).
 */
export interface BoundActionRegistry<R extends RoleRegistry> {
  /** The registry-aware `@agentAction()` decorator, bound to `R`. */
  readonly agentAction: AgentActionDecorator<R>;
  /** Execute an action's gate sequence for a given tenant `ctx`. The `ctx`
   *  carries the tenant boundary — the registry itself is tenant-agnostic. */
  invoke<T>(
    actionKey: string,
    ctx: AgentContext,
    params: unknown,
  ): Promise<Result<T, ActionError>>;
  /** Lookup a registered action descriptor by key. */
  get(key: string): ActionDescriptor | undefined;
  /** All registered action descriptors (used for tool-schema emission). */
  list(): ReadonlyArray<ActionDescriptor>;
}

/**
 * Project the public role registry (`Record<string, RoleConfig>`) down to the
 * internal `RoleConfigMap` (`{ seniority, canApproveIrreversibleUpTo }`) the
 * runtime's reversibility gate consumes. The extra public fields
 * (`displayName`, `canImpersonate`, `maxAgentSpendPerDayCents`) feed
 * subsystems not yet built (UI, impersonation, cost) — they are carried on the
 * public surface so those subsystems drop in without a surface change (ADR
 * staging table: cost-subsystem row), but the v0.1 runtime only reads the two.
 */
function toInternalRoleConfig<R extends RoleRegistry>(roles: R): RoleConfigMap {
  const out: Record<string, RoleConfigEntry> = {};
  for (const [key, cfg] of Object.entries(roles)) {
    out[key] =
      cfg.canApproveIrreversibleUpTo === undefined
        ? { seniority: cfg.seniority }
        : {
            seniority: cfg.seniority,
            canApproveIrreversibleUpTo: cfg.canApproveIrreversibleUpTo,
          };
  }
  return out;
}

/**
 * Bind a role registry to a registry-aware `@agentAction()` decorator.
 *
 * @example
 * const { agentAction } = createActionRegistry(ForgeProRoles);
 * class JobService {
 *   @agentAction({
 *     description: "...",
 *     reversibility: "idempotent",
 *     requiredPermissions: ["schedule:read"],
 *     audienceRoles: ["dispatcher", "owner", audience.self((ctx, p) => ...)],
 *     costWeight: 1,
 *   })
 *   async getTechSchedule(ctx: AgentContext, params: {...}) { ... }
 * }
 */
export function createActionRegistry<R extends RoleRegistry>(
  roles: R,
  options: CreateActionRegistryOptions = {},
): BoundActionRegistry<R> {
  const internal = new InternalActionRegistry({
    auditLogger: options.auditLogger ?? new InMemoryAuditLogger(),
    roles: toInternalRoleConfig(roles),
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });

  const internalDecorator = createAgentActionDecorator(internal);

  // The registry-aware decorator. The public `AgentActionOptions<R, P>` is a
  // strict narrowing of the internal `AgentActionOptionsInternal<P>` —
  // `Audience<R, P>` (= `RoleOf<R> | AudiencePredicate<P>`) is assignable to
  // `AudienceEntryInternal<P>` (= `string | AudiencePredicate<P>`) because
  // `RoleOf<R>` ⊆ `string`. So a single structural pass-through suffices; no
  // `any`, no per-entry reconstruction. The cast widens the array element type
  // along the proven-safe `RoleOf<R> -> string` direction only.
  const agentAction = (<P, T>(options: AgentActionOptions<R, P>) => {
    const internalOptions: AgentActionOptionsInternal<P> = {
      description: options.description,
      reversibility: options.reversibility,
      requiredPermissions: options.requiredPermissions,
      audienceRoles: options.audienceRoles,
      costWeight: options.costWeight,
      ...(options.actionKey !== undefined
        ? { actionKey: options.actionKey }
        : {}),
    };
    return internalDecorator<T, P>(internalOptions);
  }) as AgentActionDecorator<R>;

  return {
    agentAction,
    invoke: (actionKey, ctx, params) => internal.invoke(actionKey, ctx, params),
    get: (key) => internal.get(key),
    list: () => internal.list(),
  };
}
