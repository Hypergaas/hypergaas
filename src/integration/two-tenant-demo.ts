// Layer 4 — SaaS Integration / Two-tenants-one-process demo driver.
//
// The "hello world" milestone from BRIEF.md: prove that two `AgentContext`
// instances (different `tenantId`, different `userId`, different `role`)
// route through a single shared `ActionRegistry` without any cross-tenant
// leakage in the audit log, the stub `DbClient`, or the gate sequence.
//
// This is NOT the full agent runtime. It is a hand-rolled deterministic
// driver — a `for` loop over a plan array, executed with `Promise.all` to
// stress-test interleaving — that demonstrates the multi-tenant invariant
// end-to-end on one process.
//
// Per coordinator's 2026-05-19 directive:
//   - Two tenants run against the SAME registry instance. Multi-tenancy is
//     a property of `AgentContext`, not a per-registry partition (spec §4).
//   - The audit log must show every event correctly tagged by `tenantId`.
//   - The `DbClient` stub must produce tenant-scoped data.
//   - If one tenant's call hits `PauseForApproval`, the other tenant's
//     calls must continue unaffected.
//
// Out of scope today: real concurrency primitives beyond `Promise.all`,
// LLM calls, the full agent runtime, memory write-back, cost subsystem.

import type { AgentContext } from "../runtime/context/types.js";
import type { ActionError, Result } from "../runtime/result/types.js";
import type { ActionRegistry } from "../runtime/action-registry/registry.js";

/**
 * One step in a deterministic two-tenant plan.
 *
 * `tenantKey` is a logical label (e.g. `"A"`, `"B"`) the driver uses to
 * select the matching `AgentContext` from the `contextsByTenant` map. The
 * registry never sees the label — it only sees the `tenantId` carried on
 * the resolved context, which is the only authoritative tenant identity
 * per spec §4.
 */
export interface PlanStep {
  readonly tenantKey: string;
  readonly actionKey: string;
  readonly params: unknown;
}

/**
 * One result entry, paired 1:1 with its input `PlanStep`. We surface the
 * tenant label + action key alongside the registry's `Result` so the test
 * can assert "step N for tenant A produced the expected outcome" without
 * re-deriving the mapping.
 */
export interface PlanStepResult {
  readonly tenantKey: string;
  readonly actionKey: string;
  readonly result: Result<unknown, ActionError>;
}

/**
 * Execute a deterministic two-tenant plan against a single shared registry.
 *
 * `contextsByTenant` is a map of tenant label → `AgentContext`. The driver
 * resolves each `PlanStep`'s `tenantKey` against this map and dispatches via
 * `registry.invoke`. All steps are kicked off via `Promise.all` so the
 * registry sees interleaved invocations, which is the regression target for
 * the spec §2.a.7 audit-ordering invariant under multi-tenant load.
 *
 * `Promise.all` preserves the input ordering in the output array, so
 * `results[i]` corresponds to `plan[i]`. This is the deterministic property
 * the tests rely on for cross-tenant assertions.
 *
 * If a plan step references a tenant key not in `contextsByTenant`, the
 * driver throws synchronously — the plan is a developer-written artifact
 * and a missing key is a bug, not a runtime gate failure.
 */
export async function runTwoTenantPlan(
  registry: ActionRegistry,
  contextsByTenant: ReadonlyMap<string, AgentContext>,
  plan: ReadonlyArray<PlanStep>,
): Promise<ReadonlyArray<PlanStepResult>> {
  // Validate the plan up front so a typo doesn't produce a confusing
  // runtime error mid-Promise.all.
  for (const step of plan) {
    if (!contextsByTenant.has(step.tenantKey)) {
      throw new Error(
        `runTwoTenantPlan: plan references unknown tenantKey ` +
          `"${step.tenantKey}". Provide a context for each tenant key used ` +
          `in the plan.`,
      );
    }
  }

  const promises = plan.map(async (step): Promise<PlanStepResult> => {
    // Non-null assertion is safe — the validation pass above guarantees
    // contextsByTenant has the key. Keeping the lookup here (rather than
    // hoisting it into the validation pass) means each Promise closes over
    // its own context independently — no shared-state surface between
    // concurrent invocations beyond the registry itself.
    const ctx = contextsByTenant.get(step.tenantKey);
    if (ctx === undefined) {
      // Defensive — should be unreachable given the pre-pass.
      throw new Error(
        `runTwoTenantPlan: tenantKey "${step.tenantKey}" missing at dispatch`,
      );
    }
    const result = await registry.invoke<unknown>(
      step.actionKey,
      ctx,
      step.params,
    );
    return {
      tenantKey: step.tenantKey,
      actionKey: step.actionKey,
      result,
    };
  });

  return Promise.all(promises);
}
