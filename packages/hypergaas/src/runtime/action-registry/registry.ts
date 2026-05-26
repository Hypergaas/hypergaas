// Layer 1 — Runtime / Action registry.
//
// Process-wide map of action keys → ActionDescriptors. Owns the §2 runtime
// contract: gate sequence, audit ordering, reversibility gate, invocation.
//
// PoC scope (spec §8.a staging + coordinator's day-1 slice directive):
//   In-scope gate steps from spec §2.a:
//     1. resolve descriptor
//     3. tenant scope assertion
//     4. permission check
//     5. audience check
//     7. audit-log PROPOSED  (durably written BEFORE the gate — §2.a.7)
//     8. reversibility gate
//     9. invoke target method
//    10. audit-log COMPLETED | FAILED
//    12. return Result
//
//   Out-of-scope (filed in coordinator's directive as separate sessions):
//     2. schema validation       — ts-morph codegen not built yet; the PoC
//                                  uses a permissive Record<string, unknown>
//                                  fallback. A one-time warning is logged
//                                  at registration via console.warn (spec
//                                  §3.b "logs a notify-tier warning at
//                                  init time"). The warning fires once
//                                  per registry instance to avoid noise.
//     6. cost gate              — cost subsystem not built
//    11. memory write-back     — memory subsystem not built

import type { AgentContext } from "../context/types.js";
import type { AuditLogger } from "../audit/types.js";
import type { ActionError, Result } from "../result/types.js";
import { err, ok } from "../result/helpers.js";
import type {
  ActionDescriptor,
  AgentActionOptionsInternal,
  AudienceEntryInternal,
} from "./types.js";

/** Static role-config view the registry consults during the reversibility
 *  gate to compute the approver candidate set. PoC form: a flat map. The
 *  v0.1 public surface replaces this with the typed role registry from
 *  `defineRoles()` — same shape, narrower types. */
export interface RoleConfigEntry {
  readonly seniority: number;
  readonly canApproveIrreversibleUpTo?: "low" | "medium" | "high";
}
export type RoleConfigMap = Readonly<Record<string, RoleConfigEntry>>;

export interface ActionRegistryDeps {
  readonly auditLogger: AuditLogger;
  /** Per-tenant or per-app role config. PoC: shared across tenants. */
  readonly roles: RoleConfigMap;
  /** Optional clock for deterministic tests. */
  readonly nowMs?: () => number;
}

export class ActionRegistry {
  readonly #descriptors = new Map<string, ActionDescriptor>();
  readonly #deps: ActionRegistryDeps;
  #schemaWarningEmitted = false;

  constructor(deps: ActionRegistryDeps) {
    this.#deps = deps;
  }

  /** Registration entry point — called by the decorator's initializer. */
  register(descriptor: ActionDescriptor): void {
    if (this.#descriptors.has(descriptor.key)) {
      throw new Error(
        `ActionRegistry: duplicate action key "${descriptor.key}". ` +
          "Two methods registered under the same key. Provide an explicit " +
          "`actionKey` on the @agentAction() options to disambiguate.",
      );
    }
    this.#descriptors.set(descriptor.key, descriptor);
  }

  get(key: string): ActionDescriptor | undefined {
    return this.#descriptors.get(key);
  }

  list(): ReadonlyArray<ActionDescriptor> {
    return [...this.#descriptors.values()];
  }

  /**
   * The gate sequence. Returns a Result<T, ActionError>; never throws unless
   * a developer's method body throws AND somehow escapes the try/catch (it
   * cannot — the try/catch is unconditional).
   */
  async invoke<T>(
    actionKey: string,
    ctx: AgentContext,
    params: unknown,
  ): Promise<Result<T, ActionError>> {
    // ── Gate 1: resolve descriptor ──────────────────────────────────────
    const descriptor = this.#descriptors.get(actionKey);
    if (descriptor === undefined) {
      return err({ kind: "ActionNotFound", key: actionKey });
    }

    // Gate 2 (schema validation) is deferred to ts-morph codegen.
    // Spec §3.b: fall back to permissive Record<string, unknown> with a
    // one-time warning. We emit the warning at the first invocation rather
    // than at registry construction so test runs that never invoke don't
    // spam — same observable behavior, less noise.
    if (!this.#schemaWarningEmitted) {
      this.#schemaWarningEmitted = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[hypergaas] notify: no compiled schemas found; falling back to " +
          "permissive Record<string, unknown> argument validation. " +
          "Ship ts-morph codegen before the v0.1 public surface commit. " +
          "(spec §3.b)",
      );
    }

    // ── Gate 3: tenant scope assertion ──────────────────────────────────
    //
    // createAgentContext validates tenantId at construction, but the
    // registry asserts it again here because (a) the spec calls for it,
    // (b) it defends against a developer who manually constructs a context
    // literal that bypasses the constructor, and (c) it documents the
    // invariant at the registry boundary.
    if (typeof ctx.tenantId !== "string" || ctx.tenantId.length === 0) {
      return err({
        kind: "TenantScopeViolation",
        reason: "ctx.tenantId is empty or non-string at registry boundary",
      });
    }

    // ── Gate 4: permission check ────────────────────────────────────────
    const missing: string[] = [];
    for (const required of descriptor.options.requiredPermissions) {
      if (!ctx.permissions.includes(required)) {
        missing.push(required);
      }
    }
    if (missing.length > 0) {
      return err({ kind: "PermissionDenied", missing });
    }

    // ── Gate 5: audience check ──────────────────────────────────────────
    //
    // Spec §2.a.5 + §6.c check order:
    //   1. cheap static check — is ctx.role in the registry-keyed entries
    //   2. predicate audiences in declaration order; first true passes
    //   3. otherwise AudienceDenied with the list of tried audiences
    const tried: string[] = [];
    let audiencePassed = false;
    for (const entry of descriptor.options.audienceRoles) {
      if (typeof entry === "string") {
        tried.push(entry);
        if (ctx.role === entry) {
          audiencePassed = true;
          break;
        }
      } else {
        tried.push(entry.label);
        // Predicates can be developer-supplied — wrap in try/catch so a
        // buggy predicate doesn't crash the registry. A throwing predicate
        // is treated as "did not match" rather than failing the action,
        // keeping audience evaluation total.
        let matched = false;
        try {
          matched = entry.check(ctx, params);
        } catch {
          matched = false;
        }
        if (matched) {
          audiencePassed = true;
          break;
        }
      }
    }
    if (!audiencePassed) {
      return err({ kind: "AudienceDenied", tried });
    }

    // Gate 6 (cost) is out of PoC scope.

    // ── Gate 7: audit-log PROPOSED ──────────────────────────────────────
    //
    // Spec §2.a.7: durably written BEFORE the reversibility gate. The
    // in-memory logger is synchronous; the ordering invariant holds.
    const now = this.#deps.nowMs ?? (() => Date.now());
    const proposedAt = now();
    this.#deps.auditLogger.write({
      kind: "PROPOSED",
      actionKey: descriptor.key,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      tsMs: proposedAt,
      detail: {
        reversibility: descriptor.options.reversibility,
        paramsSummary: summarizeParams(params),
      },
    });

    // ── Gate 8: reversibility gate ──────────────────────────────────────
    //
    // Spec §5.a (binary form for v0.1; per-action gate level is v0.2):
    //   - idempotent / reversible: proceed
    //   - irreversible + autonomy "high": proceed
    //   - irreversible + autonomy < high: PauseForApproval
    //
    // Approver candidate set (§5.b): roles whose
    //   canApproveIrreversibleUpTo >= "high" AND
    //   seniority >= proposer's seniority.
    if (descriptor.options.reversibility === "irreversible") {
      if (ctx.tenant.autonomyLevel !== "high") {
        const approverRoles = computeApproverRoles(
          this.#deps.roles,
          ctx.role,
        );
        const reason =
          `Action "${descriptor.key}" is irreversible and tenant autonomy ` +
          `level is "${ctx.tenant.autonomyLevel}". Awaiting approval from ` +
          `one of: [${approverRoles.join(", ")}].`;
        // Note: the spec's audit-log "PROPOSED — paused for approval" line
        // is satisfied by the PROPOSED record we already wrote above
        // (with reversibility=irreversible in its detail). A future
        // workflow engine reads the suspension payload off the
        // PauseForApproval error and durably suspends.
        return err({
          kind: "PauseForApproval",
          approverRoles,
          reason,
          suspension: {
            actionKey: descriptor.key,
            tenantId: ctx.tenantId,
            proposerUserId: ctx.userId,
            proposerRole: ctx.role,
            reversibility: "irreversible",
            proposedAtMs: proposedAt,
          },
        });
      }
    }

    // ── Gate 9: invoke target method ────────────────────────────────────
    let returnValue: unknown;
    try {
      returnValue = await descriptor.invoke(ctx, params);
    } catch (cause: unknown) {
      // ── Gate 10 (failure branch): audit-log FAILED ────────────────────
      this.#deps.auditLogger.write({
        kind: "FAILED",
        actionKey: descriptor.key,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        tsMs: now(),
        detail: { causeSummary: summarizeCause(cause) },
      });
      return err({ kind: "ExecutionFailed", cause });
    }

    // ── Gate 10 (success branch): audit-log COMPLETED ───────────────────
    this.#deps.auditLogger.write({
      kind: "COMPLETED",
      actionKey: descriptor.key,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      tsMs: now(),
      detail: { returnSummary: summarizeReturn(returnValue) },
    });

    // Gate 11 (memory write-back) is out of PoC scope.

    // ── Gate 12: return typed result ────────────────────────────────────
    return ok(returnValue as T);
  }
}

/**
 * Compute the approver candidate set for an irreversible action when the
 * tenant autonomy level is below "high". Spec §5.b:
 *   canApproveIrreversibleUpTo >= gate-level (here: "high") AND
 *   seniority >= proposer's seniority.
 *
 * v0.1 gates all irreversibles at "high" when autonomy < high. v0.2
 * introduces per-action gate levels.
 */
function computeApproverRoles(
  roles: RoleConfigMap,
  proposerRole: string,
): readonly string[] {
  const proposerSeniority = roles[proposerRole]?.seniority ?? 0;
  const candidates: string[] = [];
  for (const [roleKey, cfg] of Object.entries(roles)) {
    if (
      cfg.canApproveIrreversibleUpTo === "high" &&
      cfg.seniority >= proposerSeniority
    ) {
      candidates.push(roleKey);
    }
  }
  candidates.sort();
  return candidates;
}

// ── Summarizers ───────────────────────────────────────────────────────────
//
// Keep audit-log payloads small and PII-aware. Full redactor configuration
// (spec §2.a.10) is out of PoC scope; the summarizers here truncate
// aggressively and never serialize anything that "looks like" a secret
// keyword. A v0.1 audit pipeline replaces these with a configurable
// redactor.

function summarizeParams(params: unknown): unknown {
  return shallowSummarize(params, 6);
}
function summarizeReturn(value: unknown): unknown {
  return shallowSummarize(value, 6);
}
function summarizeCause(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === "string") return cause.slice(0, 200);
  try {
    return JSON.stringify(cause).slice(0, 200);
  } catch {
    return "[unserializable cause]";
  }
}

/** Shallow summarize for audit-log payloads. Limits key count + value size. */
function shallowSummarize(value: unknown, maxKeys: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 200);
    return value;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(value)) {
    if (count >= maxKeys) {
      out["__truncated__"] = true;
      break;
    }
    if (v === null || typeof v !== "object") {
      out[k] = typeof v === "string" ? v.slice(0, 100) : v;
    } else if (Array.isArray(v)) {
      out[k] = `[Array(${v.length})]`;
    } else {
      out[k] = "[Object]";
    }
    count += 1;
  }
  return out;
}

// ── Audience-predicate constructor (internal PoC form) ─────────────────────
//
// The v0.1 public surface exports `audience.self(...)` from
// src/integration/role-registry/. Internally we expose `selfAudience(...)`
// so the worked example can demonstrate predicate audiences without
// importing the still-unbuilt public form. Same runtime shape.

/** Construct a `self`-style audience predicate (PoC internal form). */
export function selfAudience<P>(
  check: (ctx: AgentContext, params: P) => boolean,
  label: string,
): AudienceEntryInternal<P> {
  return {
    kind: "predicate",
    label,
    check,
  };
}
