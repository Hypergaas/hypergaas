// Worked example — two tenants, one process, one shared HyperGaaS registry.
//
// The "hello world" milestone from the BRIEF, expressed entirely through the
// PUBLIC `hypergaas` surface a developer actually imports. Nothing here reaches
// into package internals: `defineRoles`, `audience`, `createActionRegistry`,
// `createAgentContext`, and `InMemoryAuditLogger` are all top-level exports.
//
// Illustrative, not the regression harness: the asserted, executable copy of
// this scenario lives in `packages/hypergaas/src/__tests__/public-surface.test.ts`
// and `two-tenant-demo.test.ts`. This file shows a developer the shape of real
// usage and type-checks against the published surface (the package's
// `typecheck` script proves the example compiles against the real exports).
//
//   pnpm --filter @hypergaas/example-forgepro-multitenant typecheck

import {
  audience,
  createActionRegistry,
  createAgentContext,
  defineRoles,
  InMemoryAuditLogger,
  type AgentContext,
} from "hypergaas";

// 1. Declare the role registry once. `RoleOf<typeof Roles>` is the literal
//    union "owner" | "dispatcher" | "technician" — a typo in an audience entry
//    below is a compile error, never a silent string[].
const Roles = defineRoles({
  owner: { displayName: "Owner", seniority: 3, canApproveIrreversibleUpTo: "high" },
  dispatcher: { displayName: "Dispatcher", seniority: 2 },
  technician: { displayName: "Technician", seniority: 1 },
});

// 2. Bind the registry. This is the one-time init step; `agentAction` is now
//    typed against `Roles`. One registry serves every tenant.
const auditLogger = new InMemoryAuditLogger();
const { agentAction, invoke } = createActionRegistry(Roles, { auditLogger });

// 3. A developer's existing service class — annotated in place, no parallel
//    schema, no rewrite. `audienceRoles` mixes static role keys with a
//    `audience.self(...)` predicate whose params are inferred from the method.
class JobService {
  @agentAction<{ techId: string }, JobService>({
    description: "Get a technician's schedule",
    reversibility: "idempotent",
    requiredPermissions: ["schedule:read"],
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
    params: { techId: string },
  ): Promise<ReadonlyArray<string>> {
    // ctx.tenantId is validated non-empty by the registry; the developer uses
    // it in their own data access. Returned data is intentionally trivial here.
    return [`${ctx.tenantId}:${params.techId}:job-1`];
  }
}

// Instantiate so the decorators register the action on the bound registry.
void new JobService();

// 4. Two tenants. Multi-tenancy is a property of the AgentContext, NOT a
//    per-registry partition — the same `invoke` serves both.
const tenantA: AgentContext = createAgentContext({
  tenantId: "acme-hvac",
  userId: "owner-1",
  role: "owner",
  permissions: ["schedule:read"],
  autonomyLevel: "high",
});

const tenantB: AgentContext = createAgentContext({
  tenantId: "bright-plumbing",
  userId: "tech-7",
  role: "technician",
  permissions: ["schedule:read"],
  autonomyLevel: "high",
});

async function main(): Promise<void> {
  // Tenant A's owner reads a schedule (static "owner" audience passes).
  const a = await invoke("JobService.getTechSchedule", tenantA, {
    techId: "tech-3",
  });
  // Tenant B's technician reads their OWN schedule (audience.self passes
  // because ctx.userId === params.techId).
  const b = await invoke("JobService.getTechSchedule", tenantB, {
    techId: "tech-7",
  });

  // Every audit event is tagged with the correct tenantId — no leakage.
  for (const event of auditLogger.events) {
    // eslint-disable-next-line no-console
    console.log(`[audit] tenant=${event.tenantId} kind=${event.kind}`);
  }
  // eslint-disable-next-line no-console
  console.log("tenant A ok:", a.ok, "| tenant B ok:", b.ok);
}

void main();
