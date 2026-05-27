// Layer 4 — SaaS Integration / ForgePro JobService (v0.1 PUBLIC-surface
// worked example). The spec §7 canonical example, expressed through the REAL
// registry-aware public surface — the first time `@agentAction()`'s public
// type signature appears on disk.
//
// This is the public-facing counterpart to the internal-machinery fixture in
// `job-service.ts`. There, `audienceRoles` is raw strings against the internal
// `ActionRegistry` (spec §8.a staging). HERE, `audienceRoles` is typed against
// `ForgeProRoles` via `createActionRegistry(ForgeProRoles)`: the static entries
// are `RoleOf<typeof ForgeProRoles>` (a typo is a compile error) and the
// dynamic entry is `audience.self(...)` with `params` inferred from the method.
// No `string[]`, no `any`.

import type { AgentContext } from "../runtime/context/types.js";
import type { AuditLogger } from "../runtime/audit/types.js";
import { audience } from "../integration/role-registry/index.js";
import {
  createActionRegistry,
  type BoundActionRegistry,
} from "../integration/action-registry/index.js";
import { ForgeProRoles, type ForgeProRole } from "./forgepro-roles.js";
import type { Credit, DbClient, ScheduleEntry } from "./db-client.js";

/**
 * Build a ForgePro JobService bound to a fresh registry-aware registry.
 *
 * The factory pattern (`createForgeProJobService(db)`) is the same PoC
 * concession as `job-service.ts`: TC39 stage-3 decorator factories bind to a
 * specific registry, and we close over `db` rather than holding it as a
 * `private` field to sidestep TS4094 on the anonymous-exported class. In a
 * developer's own repo, `JobService` is a named user-defined class and
 * `agentAction` is destructured once from `createActionRegistry(roles)` at
 * module scope — the natural shape spec §7 shows.
 *
 * Returns both the bound registry and the service instance so callers (and
 * tests) can drive the gate sequence via `registry.invoke(...)`.
 */
export function createForgeProJobService(
  db: DbClient,
  options: { readonly auditLogger?: AuditLogger; readonly nowMs?: () => number } = {},
): {
  readonly registry: BoundActionRegistry<typeof ForgeProRoles>;
  readonly jobService: object;
} {
  const registry = createActionRegistry(ForgeProRoles, options);
  const { agentAction } = registry;
  const localDb = db;

  class ForgeProJobService {
    @agentAction<{ techId: string; date: Date }, ForgeProJobService>({
      description: "Get a technician's schedule for a given date",
      reversibility: "idempotent",
      requiredPermissions: ["schedule:read"],
      // Registry-aware: 'dispatcher' / 'owner' are RoleOf<typeof ForgeProRoles>.
      // A typo (e.g. 'dispather') would be a compile error here. The self
      // predicate's `params` is inferred as { techId: string }.
      audienceRoles: [
        "dispatcher",
        "owner",
        audience.self(
          (ctx, params: { techId: string }) => ctx.userId === params.techId,
          "self: tech viewing own schedule",
        ),
      ],
      costWeight: 1,
    })
    async getTechSchedule(
      ctx: AgentContext,
      params: { techId: string; date: Date },
    ): Promise<ReadonlyArray<ScheduleEntry>> {
      return localDb.schedule.find({
        tenantId: ctx.tenantId, // registry already validated non-empty
        techId: params.techId,
        date: params.date,
      });
    }

    @agentAction<
      { customerId: string; amountCents: number; reason: string },
      ForgeProJobService
    >({
      description: "Issue a goodwill credit to a customer",
      reversibility: "irreversible",
      requiredPermissions: ["billing:write"],
      audienceRoles: ["owner"], // only owner; gates whenever autonomy < high
      costWeight: 5,
    })
    async issueGoodwillCredit(
      ctx: AgentContext,
      params: { customerId: string; amountCents: number; reason: string },
    ): Promise<Credit> {
      return localDb.credits.create({
        tenantId: ctx.tenantId,
        customerId: params.customerId,
        amountCents: params.amountCents,
        reason: params.reason,
      });
    }
  }

  return { registry, jobService: new ForgeProJobService() };
}

// Re-export the role type so the worked example is self-contained for docs.
export type { ForgeProRole };
