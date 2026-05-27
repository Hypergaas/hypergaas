// Section 3 — 5-minute quickstart.
// Directive spec: copy-paste install + decorator on existing service +
// createAgentContext(tenantId, userId) + invocation. End state: a working
// JobService.getTechSchedule invocation with tenant-scoped audit log.
// The exact code blocks are GTM + ship's (post v0.1 public-type-surface commit).
// Structural shell only.
// Code blocks pulled from the shipped v0.1 public surface (commit b7f5dda) and the
// ForgePro anchor example — exact symbols, not illustrative pseudo-code.
const STEP_INSTALL = `npm install @hypergaas/core`;

const STEP_DECORATE = `// 1. Bind your roles to the registry once, at module scope.
import { defineRoles, audience, createActionRegistry, type AgentContext } from "@hypergaas/core";

const roles = defineRoles({
  owner: { displayName: "Owner", seniority: 4, canApproveIrreversibleUpTo: "high" },
  dispatcher: { displayName: "Dispatcher", seniority: 3, canApproveIrreversibleUpTo: "medium" },
  technician: { displayName: "Technician", seniority: 1 },
});

const { agentAction, invoke } = createActionRegistry(roles);

// 2. Decorate a service method you already have. No parallel schema, no handler.
class JobService {
  @agentAction({
    description: "Get a technician's schedule for a given date",
    reversibility: "idempotent",
    requiredPermissions: ["schedule:read"],
    // 'dispatcher' | 'owner' are checked against your role registry — a typo is a
    // compile error. audience.self(...) infers params from the method signature.
    audienceRoles: ["dispatcher", "owner", audience.self((ctx, p) => ctx.userId === p.techId)],
    costWeight: 1,
  })
  async getTechSchedule(ctx: AgentContext, params: { techId: string; date: Date }) {
    return this.db.schedule.find({ tenantId: ctx.tenantId, ...params });
  }
}`;

const STEP_INVOKE = `import { createAgentContext, isOk } from "@hypergaas/core";

// 3. Build one context per request. It is the only source of tenant identity —
//    set it once at your request layer and never thread tenantId by hand again.
const ctx = createAgentContext({
  tenantId: "acme-hvac",
  userId: "u_marcus",
  role: "dispatcher",
  permissions: ["schedule:read"],
  autonomyLevel: "medium",
});

// 4. Invoke. Permissions and tenant scope are enforced before the body runs;
//    the result is typed, not thrown.
const result = await invoke("JobService.getTechSchedule", ctx, {
  techId: "u_marcus",
  date: new Date("2026-05-25"),
});

if (isOk(result)) {
  console.log(result.value); // the schedule, scoped to tenant "acme-hvac"
}

// The default in-memory audit logger now holds a paired PROPOSED + COMPLETED
// record for this call — actionKey, tenantId, userId, role — without you writing
// a line of audit code. Swap InMemoryAuditLogger for a durable backend behind the
// same interface when you go to production.`;

export function Quickstart() {
  return (
    <section id="quickstart" aria-labelledby="quickstart-heading" className="flex flex-col gap-6">
      <h2 id="quickstart-heading" className="text-3xl font-semibold tracking-tight">
        From a service method to a tenant-scoped, audited agent action in five minutes.
      </h2>

      <p className="max-w-2xl text-neutral-600">
        This is the whole loop: install, decorate a method you already have, build a
        context, invoke. By the end you have a permission-checked, tenant-scoped call with
        an audit trail — and you wrote none of that plumbing.
      </p>

      {/* Step 1 — install */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{STEP_INSTALL}</code>
      </pre>

      {/* Step 2 — bind roles + decorate an existing service method */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{STEP_DECORATE}</code>
      </pre>

      {/* Step 3 — createAgentContext + invoke + tenant-scoped audit */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{STEP_INVOKE}</code>
      </pre>
    </section>
  );
}
