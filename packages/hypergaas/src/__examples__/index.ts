// Layer 4 — SaaS Integration Layer. Action registry (`@agentAction()`),
// multi-tenant context (`createAgentContext(tenantId, userId)`), and the
// React integration (`<AgentPanel>`, `useAgent()`).
//
// The first commit that publishes `@agentAction()`'s public type signature
// must ship the typed role registry — see
// `domains/engineering/decisions/role-registry.md` and the spec at
// `sdk/docs/specs/action-registry.md`. That commit is `approve`-tier.
//
// The v0.1 PUBLIC surface (registry-aware action registry + typed role
// registry) is re-exported from `src/index.ts`. This barrel carries the
// worked-example fixtures (both the internal-machinery `createJobService` and
// the public-surface `createForgeProJobService`) plus the multi-tenant demo
// driver.

export type { Credit, DbClient, ScheduleEntry } from "./db-client.js";
export { createStubDbClient } from "./db-client.js";

// Internal-machinery fixture — raw-string audienceRoles against the internal
// ActionRegistry (spec §8.a staging). Stays as the runtime regression fixture.
export { createJobService } from "./job-service.js";

// Public-surface worked example — registry-aware audienceRoles via
// createActionRegistry(ForgeProRoles). The spec §7 canonical example, real.
export { ForgeProRoles, type ForgeProRole } from "./forgepro-roles.js";
export { createForgeProJobService } from "./forgepro-job-service.js";

export type { PlanStep, PlanStepResult } from "./two-tenant-demo.js";
export { runTwoTenantPlan } from "./two-tenant-demo.js";
