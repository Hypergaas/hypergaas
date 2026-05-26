# HyperGaaS

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

**Add agents to your SaaS — without rewriting your service layer.**

HyperGaaS is an open-source agent SDK for B2B SaaS. You annotate a service
method you already have; the SDK derives the tool schema from your TypeScript
types, scopes every call to the right tenant, checks permissions, writes the
audit log, and pauses irreversible actions for approval — from one decorator,
in the file your business logic already lives in. No parallel schemas, no
hand-rolled tenant/permission/audit plumbing.

> **Status: v0.1, pre-release.** Not yet published to npm. Docs coming soon.

## Repository layout

This is a pnpm-workspace monorepo.

| Path | What it is |
|---|---|
| `packages/hypergaas/` | The SDK package — the action registry, typed role registry, multi-tenant context, and the build-time schema codegen CLI. |
| `site/` | The landing page + docs site (Next.js). |
| `examples/` | Worked, illustrative examples that consume the published package surface. |
| `docs/` | Architecture decision records (`docs/decisions/`) and specs (`docs/specs/`). |

## A taste

```typescript
import { defineRoles, audience, createActionRegistry, type AgentContext } from "hypergaas";

const roles = defineRoles({
  owner: { displayName: "Owner", seniority: 4, canApproveIrreversibleUpTo: "high" },
  dispatcher: { displayName: "Dispatcher", seniority: 3 },
  technician: { displayName: "Technician", seniority: 1 },
});

const { agentAction, invoke } = createActionRegistry(roles);

// Decorate a method you already have. No parallel schema, no handler.
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
}
```

See [`packages/hypergaas/README.md`](./packages/hypergaas/README.md) for the
full quickstart, and [`examples/`](./examples) for a runnable multi-tenant
walkthrough.

## Development

```bash
pnpm install          # install workspace dependencies
pnpm test             # run the SDK test suite
pnpm build            # codegen → tsc build of the SDK package
```

## License

[Apache-2.0](./LICENSE). See [`NOTICE`](./NOTICE) for attribution.
