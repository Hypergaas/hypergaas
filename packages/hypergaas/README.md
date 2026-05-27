# hypergaas

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

**Add agents to your SaaS — without rewriting your service layer.**

The HyperGaaS SDK: a typed, multi-tenant action registry over your existing
service layer. Annotate a method you already have with `@agentAction()` and the
SDK derives the tool schema from your TypeScript types, scopes every call to the
right tenant, enforces permissions, writes an audit log, and pauses irreversible
actions for approval — one decorator, one place, no parallel schemas.

> **Status: v0.1, pre-release.** Not yet published to npm. Docs coming soon.

## Install

```bash
npm install @hypergaas/core
```

## Quickstart

```typescript
// 1. Bind your roles to the registry once, at module scope.
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
    audienceRoles: ["dispatcher", "owner", audience.self((ctx, p) => ctx.userId === p.techId)],
    costWeight: 1,
  })
  async getTechSchedule(ctx: AgentContext, params: { techId: string; date: Date }) {
    return this.db.schedule.find({ tenantId: ctx.tenantId, ...params });
  }
}
```

```typescript
import { createAgentContext, isOk } from "@hypergaas/core";

// 3. Build one context per request — the only source of tenant identity.
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
```

By the end you have a permission-checked, tenant-scoped call with a paired
`PROPOSED` + `COMPLETED` audit record — and you wrote none of that plumbing. The
default `InMemoryAuditLogger` swaps for a durable backend behind the same
interface in production.

## Build-time schema codegen

The `hypergaas-extract` CLI walks your `tsconfig.json`, finds `@agentAction()`
methods, and emits a `hypergaas.actions.json` artifact with a tool schema derived
from your method param types — no schema drift, no parallel definitions. It runs
ahead of `tsc` in this package's `build` script.

## License

[Apache-2.0](./LICENSE).
