// Layer 4 — SaaS Integration / JobService worked example.
//
// Mirrors spec §7 and the role-registry decision doc's example. Two methods:
//   - getTechSchedule  (idempotent, dispatcher/owner/self predicate)
//   - issueGoodwillCredit (irreversible, owner-only)
//
// The factory pattern (`createJobService(registry, db)`) is a PoC-only
// concession: TC39 stage-3 decorator factories must be bound to a specific
// registry, and we don't have the public-surface `createActionRegistry(roles)`
// binding step yet. The v0.1 public form lets developers write
// `import { agentAction } from "hypergaas"` after a one-time `createActionRegistry`
// call — same ergonomics, different import shape.

import type { AgentContext } from "../runtime/context/types.js";
import {
  ActionRegistry,
  createAgentActionDecorator,
  selfAudience,
} from "../runtime/index.js";
import type { Credit, DbClient, ScheduleEntry } from "./db-client.js";

/** Build a JobService class bound to a given registry + db. */
export function createJobService(registry: ActionRegistry, db: DbClient) {
  const agentAction = createAgentActionDecorator(registry);
  // Close over `db` instead of holding it as a `private` field on an
  // anonymous-exported class — TS4094 (exported anonymous class can't have
  // private/protected members) makes the parameter-property pattern
  // awkward here. Functionally identical; the developer-facing v0.1 form
  // (where the class is a named user-defined class, not factory-produced)
  // gets to use the natural `constructor(private readonly db: DbClient)`
  // shape again.
  const localDb = db;

  class JobService {
    @agentAction<JobService, { techId: string; date: Date }>({
      description: "Get a technician's schedule for a given date",
      reversibility: "idempotent",
      requiredPermissions: ["schedule:read"],
      // PoC raw-string audienceRoles per spec §8.a. The v0.1 commit replaces
      // these literals with `RoleOf<typeof ForgeProRoles>`-typed values.
      audienceRoles: [
        "dispatcher",
        "owner",
        selfAudience<{ techId: string; date: Date }>(
          (ctx, params) => ctx.userId === params.techId,
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
      JobService,
      { customerId: string; amountCents: number; reason: string }
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

  return new JobService();
}
