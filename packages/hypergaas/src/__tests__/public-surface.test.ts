// v0.1 PUBLIC surface — the registry-aware @agentAction() decorator, the typed
// role registry, and the predicate constructor.
//
// This is the coverage for batch item #5 (approved.jsonl line 8): the first
// commit publishing @agentAction()'s public type signature. The cases below
// drive the surface a developer actually imports — `createActionRegistry`,
// `defineRoles`, `audience.self`, `RoleOf<>`, `AudiencePredicate<P>` — and
// assert both runtime behavior and the no-`any` type-level guarantees.
//
// Locked inputs (NOT re-litigated, react-cleanly rule 6):
//   - AudiencePredicate<P> IS exported (approved.jsonl line 6).
//   - ts-morph codegen via `pnpm run build`, option A (approved.jsonl line 7).

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  audience,
  createActionRegistry,
  createAgentContext,
  defineRoles,
  InMemoryAuditLogger,
  type AgentContext,
  type Audience,
  type AudiencePredicate,
  type RoleOf,
} from "../index.js";
import { createStubDbClient } from "../integration/db-client.js";
import {
  createForgeProJobService,
  ForgeProRoles,
  type ForgeProRole,
} from "../integration/index.js";

const ANY_DATE = new Date("2026-05-25T09:00:00Z");

function buildPublicHarness() {
  const auditLogger = new InMemoryAuditLogger();
  const db = createStubDbClient();
  const { registry } = createForgeProJobService(db, {
    auditLogger,
    nowMs: () => 1_700_000_000_000,
  });
  return { auditLogger, registry };
}

describe("v0.1 public surface — registry-aware @agentAction()", () => {
  const origWarn = console.warn;
  beforeEach(() => {
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = origWarn;
  });

  // ── The decorator binds correctly via createActionRegistry ──────────────
  it("registers actions and exposes them via list() with the four runtime keys", () => {
    const { registry } = buildPublicHarness();
    const keys = registry.list().map((d) => d.key);
    expect(keys).toContain("ForgeProJobService.getTechSchedule");
    expect(keys).toContain("ForgeProJobService.issueGoodwillCredit");

    // single-registry-many-contexts.md rule 1: the bound registry exposes
    // exactly { agentAction, invoke, get, list } — NO forTenant / partition.
    const registryKeys = Object.keys(registry).sort();
    expect(registryKeys).toEqual(["agentAction", "get", "invoke", "list"]);
  });

  // ── Static role-key audience passes ─────────────────────────────────────
  it("owner passes the static role audience (registry-aware key)", async () => {
    const { registry } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke(
      "ForgeProJobService.getTechSchedule",
      ctx,
      { techId: "tech-7", date: ANY_DATE },
    );
    expect(result.ok).toBe(true);
  });

  // ── audience.self predicate passes (params inferred from the action) ────
  it("technician viewing OWN schedule passes via audience.self predicate", async () => {
    const { registry } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "tech-7",
      role: "technician",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke(
      "ForgeProJobService.getTechSchedule",
      ctx,
      { techId: "tech-7", date: ANY_DATE },
    );
    expect(result.ok).toBe(true);
  });

  // ── audience deny when neither static role nor predicate matches ────────
  it("denies a technician viewing someone else's schedule", async () => {
    const { registry } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "tech-7",
      role: "technician",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke(
      "ForgeProJobService.getTechSchedule",
      ctx,
      { techId: "tech-other", date: ANY_DATE },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("AudienceDenied");
    }
  });

  // ── irreversible action gates through the public surface ────────────────
  it("issueGoodwillCredit pauses for approval at autonomy below high", async () => {
    const { registry } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "low",
    });
    const result = await registry.invoke(
      "ForgeProJobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "PauseForApproval") {
      // §5.b: approver set = roles with canApproveIrreversibleUpTo >= "high"
      // AND seniority >= proposer's. Owner (seniority 4, "high") only. The
      // public RoleConfig's canApproveIrreversibleUpTo fed the runtime gate.
      expect(result.error.approverRoles).toEqual(["owner"]);
      expect(result.error.suspension.tenantId).toBe("tenant-1");
    } else {
      throw new Error("expected PauseForApproval");
    }
  });

  // ── irreversible at high proceeds ───────────────────────────────────────
  it("issueGoodwillCredit proceeds at autonomy high", async () => {
    const { registry } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["billing:write"],
      autonomyLevel: "high",
    });
    const result = await registry.invoke(
      "ForgeProJobService.issueGoodwillCredit",
      ctx,
      { customerId: "cust-1", amountCents: 2500, reason: "late tech" },
    );
    expect(result.ok).toBe(true);
  });

  // ── audit pairing still holds through the public binding ────────────────
  it("emits paired PROPOSED + COMPLETED through the bound registry", async () => {
    const { registry, auditLogger } = buildPublicHarness();
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "owner-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    await registry.invoke("ForgeProJobService.getTechSchedule", ctx, {
      techId: "tech-7",
      date: ANY_DATE,
    });
    const events = auditLogger.events;
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("PROPOSED");
    expect(events[1]?.kind).toBe("COMPLETED");
  });
});

describe("v0.1 public surface — role registry primitives", () => {
  // ── defineRoles is identity at runtime, preserves the literal type ──────
  it("defineRoles returns the registry unchanged at runtime", () => {
    const roles = defineRoles({
      admin: { displayName: "Admin", seniority: 2 },
      member: { displayName: "Member", seniority: 1 },
    });
    expect(roles.admin.displayName).toBe("Admin");
    expect(roles.member.seniority).toBe(1);
  });

  // ── audience.self constructs a labeled predicate ────────────────────────
  it("audience.self constructs an AudiencePredicate with kind + label", () => {
    const pred = audience.self<{ ownerId: string }>(
      (ctx, params) => ctx.userId === params.ownerId,
      "self: owns the record",
    );
    expect(pred.kind).toBe("predicate");
    expect(pred.label).toBe("self: owns the record");

    const ctx = createAgentContext({
      tenantId: "t",
      userId: "u-1",
      role: "member",
      permissions: [],
      autonomyLevel: "high",
    });
    expect(pred.check(ctx, { ownerId: "u-1" })).toBe(true);
    expect(pred.check(ctx, { ownerId: "u-2" })).toBe(false);
  });

  // ── audience.self default label ─────────────────────────────────────────
  it("audience.self defaults the label to 'self'", () => {
    const pred = audience.self<{ id: string }>(() => true);
    expect(pred.label).toBe("self");
  });

  // ── TYPE-LEVEL: RoleOf<> derives the literal key union (no any) ──────────
  it("RoleOf<typeof ForgeProRoles> is the exact role-key union", () => {
    expectTypeOf<ForgeProRole>().toEqualTypeOf<
      "owner" | "dispatcher" | "csr" | "technician"
    >();
    // RoleOf is keyof R & string — a developer's own registry behaves the same.
    type MyRoles = typeof ForgeProRoles;
    expectTypeOf<RoleOf<MyRoles>>().toEqualTypeOf<ForgeProRole>();
  });

  // ── TYPE-LEVEL: Audience<R,P> is RoleOf<R> | AudiencePredicate<P> ────────
  it("Audience<R,P> narrows the string side to RoleOf<R> (no string[])", () => {
    type A = Audience<typeof ForgeProRoles, { techId: string }>;
    // A static entry must be a registry role key, never an arbitrary string.
    expectTypeOf<"owner">().toMatchTypeOf<A>();
    expectTypeOf<AudiencePredicate<{ techId: string }>>().toMatchTypeOf<A>();
    // A non-role string is NOT assignable — this is the no-string[] guarantee.
    expectTypeOf<"not-a-role">().not.toMatchTypeOf<A>();
  });

  // ── TYPE-LEVEL: AudiencePredicate<P> is exported + usable (no any) ───────
  it("AudiencePredicate<P> is exported so developers author predicates without any", () => {
    // A developer authoring their own predicate factory uses the exported type
    // directly — the no-`any` escape-hatch closure (approved.jsonl line 6).
    const sameAccountManager: AudiencePredicate<{ accountManagerId: string }> = {
      kind: "predicate",
      label: "same account manager",
      check: (ctx, params) => ctx.userId === params.accountManagerId,
    };
    expectTypeOf(sameAccountManager.check)
      .parameter(1)
      .toEqualTypeOf<{ accountManagerId: string }>();
    expect(sameAccountManager.kind).toBe("predicate");
  });

  // ── TYPE-LEVEL: the self predicate's params are inferred, not any ───────
  it("audience.self infers the params type for the check callback", () => {
    audience.self((ctx: AgentContext, params: { recordId: string }) => {
      expectTypeOf(params).toEqualTypeOf<{ recordId: string }>();
      expectTypeOf(ctx).toEqualTypeOf<AgentContext>();
      return true;
    });
    expect(true).toBe(true);
  });
});
