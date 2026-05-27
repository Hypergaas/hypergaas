// Action registry — gate-path coverage (spec §2 runtime contract).
//
// Required cases per coordinator's day-1 directive:
//   - tenant-scope rejects empty/forged tenantId
//   - permission-denied returns typed error
//   - audience static-key pass
//   - audience-deny when no role + no predicate matches
//   - audience self-predicate pass (tech viewing own schedule)
//   - idempotent proceeds
//   - irreversible + autonomy "low" → PauseForApproval w/ correct approver set
//   - irreversible + autonomy "high" → proceeds
//   - audit log paired PROPOSED + COMPLETED on success
//   - audit log paired PROPOSED + FAILED on developer-method throw
//
// Plus a smoke test for ActionNotFound and the audience-predicate-throw
// trap-door (a buggy predicate must not crash the registry).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ActionRegistry,
  InMemoryAuditLogger,
  createAgentActionDecorator,
  createAgentContext,
  selfAudience,
  type AgentContext,
  type RoleConfigMap,
} from "../runtime/index.js";
import { createStubDbClient } from "../__examples__/db-client.js";
import { createJobService } from "../__examples__/job-service.js";

// Forge Pro role config — mirrors spec §7 / role-registry decision doc.
const FORGE_PRO_ROLES: RoleConfigMap = {
  owner: { seniority: 4, canApproveIrreversibleUpTo: "high" },
  dispatcher: { seniority: 3, canApproveIrreversibleUpTo: "medium" },
  csr: { seniority: 2 },
  technician: { seniority: 1 },
};

function buildHarness() {
  const auditLogger = new InMemoryAuditLogger();
  const registry = new ActionRegistry({
    auditLogger,
    roles: FORGE_PRO_ROLES,
    nowMs: () => 1_700_000_000_000,
  });
  const db = createStubDbClient();
  const jobService = createJobService(registry, db);
  return { auditLogger, registry, jobService };
}

const ANY_DATE = new Date("2026-05-17T09:00:00Z");

describe("ActionRegistry gate sequence", () => {
  // suppress the one-time schema-warning so test output is clean
  const origWarn = console.warn;
  beforeEach(() => {
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = origWarn;
  });

  // ── Gate 1: resolve descriptor ────────────────────────────────────────
  it("Gate 1 — returns ActionNotFound for an unregistered key", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("JobService.notARealMethod", ctx, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("ActionNotFound");
      if (result.error.kind === "ActionNotFound") {
        expect(result.error.key).toBe("JobService.notARealMethod");
      }
    }
  });

  // ── Gate 3: tenant scope ──────────────────────────────────────────────
  it("Gate 3 — rejects a forged context with empty tenantId", async () => {
    const { registry } = buildHarness();
    // Bypass createAgentContext to forge the invalid shape. The registry
    // must still catch it at the boundary (defense in depth per spec §4).
    const forged = {
      tenantId: "",
      userId: "user-1",
      role: "owner",
      permissions: ["schedule:read"],
      tenant: { autonomyLevel: "high" as const },
    } satisfies AgentContext;
    const result = await registry.invoke("JobService.getTechSchedule", forged, {
      techId: "user-1",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("TenantScopeViolation");
    }
  });

  // ── Gate 4: permission check ──────────────────────────────────────────
  it("Gate 4 — returns PermissionDenied with the missing list", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
      permissions: [], // missing schedule:read
      autonomyLevel: "high",
    });
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "user-1",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "PermissionDenied") {
      expect(result.error.missing).toEqual(["schedule:read"]);
    } else {
      throw new Error("expected PermissionDenied");
    }
  });

  // ── Gate 5: audience — static key pass ────────────────────────────────
  it("Gate 5 — owner role passes the static audience check", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "tech-7",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(true);
  });

  // ── Gate 5: audience — deny when neither role nor predicate matches ──
  it("Gate 5 — denies when role is not in audience and self-predicate is false", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "tech-7",
      role: "technician",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    // A technician viewing someone *else's* schedule — neither static
    // role match (technician is not in audienceRoles) nor self predicate.
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "tech-other",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "AudienceDenied") {
      expect(result.error.tried).toEqual([
        "dispatcher",
        "owner",
        "self: tech viewing own schedule",
      ]);
    } else {
      throw new Error("expected AudienceDenied");
    }
  });

  // ── Gate 5: audience — self predicate passes ─────────────────────────
  it("Gate 5 — technician viewing OWN schedule passes via self predicate", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "tech-7",
      role: "technician",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "tech-7",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rows = result.value as ReadonlyArray<{ tenantId: string }>;
      // tenantId on returned rows reflects ctx.tenantId — the developer
      // pattern that the registry's tenantId guarantee enables.
      expect(rows[0]?.tenantId).toBe("tenant-1");
    }
  });

  // ── Gate 5: buggy predicate doesn't crash the registry ───────────────
  it("Gate 5 — a throwing predicate is treated as non-matching, not a crash", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const registry = new ActionRegistry({
      auditLogger,
      roles: FORGE_PRO_ROLES,
    });
    const agentAction = createAgentActionDecorator(registry);

    class BuggyService {
      @agentAction<BuggyService, { x: number }>({
        description: "demo",
        reversibility: "idempotent",
        requiredPermissions: [],
        audienceRoles: [
          selfAudience<{ x: number }>(() => {
            throw new Error("predicate exploded");
          }, "buggy-predicate"),
        ],
        costWeight: 1,
      })
      async run(_ctx: AgentContext, params: { x: number }) {
        return params.x;
      }
    }
    // Instantiate to trigger the decorator's addInitializer.
    new BuggyService();

    const ctx = createAgentContext({
      tenantId: "t",
      userId: "u",
      role: "csr",
      permissions: [],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("BuggyService.run", ctx, { x: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("AudienceDenied");
    }
  });

  // ── Gate 8: reversibility — idempotent proceeds ──────────────────────
  it("Gate 8 — idempotent action proceeds regardless of autonomy level", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "low", // even at low, idempotent proceeds
    });
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "tech-7",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(true);
  });

  // ── Gate 8: reversibility — irreversible at "high" proceeds ──────────
  it("Gate 8 — irreversible action proceeds at autonomy high", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke(
      "JobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(true);
  });

  // ── Gate 8: irreversible at "low" → PauseForApproval ─────────────────
  it("Gate 8 — irreversible at autonomy low returns PauseForApproval w/ correct approvers", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "low",
    });
    const result = await registry.invoke(
      "JobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "PauseForApproval") {
      // §5.b: approvers are roles with canApproveIrreversibleUpTo >= "high"
      // AND seniority >= proposer's. Proposer is `owner` (seniority 4).
      // The only role with canApproveIrreversibleUpTo === "high" is owner.
      expect(result.error.approverRoles).toEqual(["owner"]);
      // Suspension payload carries everything a workflow engine needs to
      // durably resume.
      expect(result.error.suspension.actionKey).toBe(
        "JobService.issueGoodwillCredit",
      );
      expect(result.error.suspension.tenantId).toBe("tenant-1");
      expect(result.error.suspension.proposerUserId).toBe("owner-1");
      expect(result.error.suspension.proposerRole).toBe("owner");
      expect(result.error.suspension.reversibility).toBe("irreversible");
      expect(typeof result.error.suspension.proposedAtMs).toBe("number");
    } else {
      throw new Error("expected PauseForApproval");
    }
  });

  // ── Gate 8: irreversible at "medium" still pauses (binary v0.1 rule) ──
  it("Gate 8 — irreversible at autonomy medium also pauses (binary v0.1 rule)", async () => {
    const { registry } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "medium",
    });
    const result = await registry.invoke(
      "JobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("PauseForApproval");
    }
  });

  // ── Audit log: paired PROPOSED + COMPLETED on success ────────────────
  it("Audit — paired PROPOSED + COMPLETED on successful invocation", async () => {
    const { registry, auditLogger } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("JobService.getTechSchedule", ctx, {
      techId: "tech-7",
      date: ANY_DATE,
    });
    expect(result.ok).toBe(true);
    const events = auditLogger.events;
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("PROPOSED");
    expect(events[1]?.kind).toBe("COMPLETED");
    // Spec §2.a.7 ordering invariant — PROPOSED first, always.
    expect(events[0]?.actionKey).toBe("JobService.getTechSchedule");
    expect(events[0]?.tenantId).toBe("tenant-1");
    expect(events[1]?.tenantId).toBe("tenant-1");
  });

  // ── Audit log: paired PROPOSED + FAILED on developer throw ───────────
  it("Audit — paired PROPOSED + FAILED when the developer method throws", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const registry = new ActionRegistry({
      auditLogger,
      roles: FORGE_PRO_ROLES,
    });
    const agentAction = createAgentActionDecorator(registry);

    class ThrowingService {
      @agentAction<ThrowingService, Record<string, unknown>>({
        description: "always throws",
        reversibility: "idempotent",
        requiredPermissions: [],
        audienceRoles: ["owner"],
        costWeight: 1,
      })
      async boom(_ctx: AgentContext, _params: Record<string, unknown>) {
        throw new Error("kaboom");
      }
    }
    new ThrowingService();

    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: [],
      autonomyLevel: "high",
    });
    const result = await registry.invoke("ThrowingService.boom", ctx, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("ExecutionFailed");
      if (result.error.kind === "ExecutionFailed") {
        expect((result.error.cause as Error).message).toBe("kaboom");
      }
    }
    const events = auditLogger.events;
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("PROPOSED");
    expect(events[1]?.kind).toBe("FAILED");
  });

  // ── PauseForApproval still emits PROPOSED before returning ───────────
  it("Audit — PROPOSED is written even when gate returns PauseForApproval", async () => {
    const { registry, auditLogger } = buildHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "low",
    });
    const result = await registry.invoke(
      "JobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(false);
    const events = auditLogger.events;
    // Spec §2.a.7: PROPOSED durably written BEFORE the gate. So even
    // though the gate paused, the PROPOSED record exists. No COMPLETED
    // or FAILED follows (the workflow engine will pair it with one of
    // those when approval arrives or is denied).
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("PROPOSED");
  });
});
