// AgentContext construction invariants (spec §4).
//
// - non-empty tenantId required
// - userId / role required
// - returned object is frozen at every level we care about
// - no public mutation path (assignment is a no-op or throws in strict mode)

import { describe, expect, it } from "vitest";
import { createAgentContext } from "../runtime/index.js";

describe("createAgentContext", () => {
  it("constructs a frozen context with valid input", () => {
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
      permissions: ["schedule:read"],
      autonomyLevel: "high",
    });
    expect(ctx.tenantId).toBe("tenant-1");
    expect(ctx.userId).toBe("user-1");
    expect(ctx.role).toBe("owner");
    expect(ctx.permissions).toEqual(["schedule:read"]);
    expect(ctx.tenant.autonomyLevel).toBe("high");
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.tenant)).toBe(true);
    expect(Object.isFrozen(ctx.permissions)).toBe(true);
  });

  it("rejects empty tenantId", () => {
    expect(() =>
      createAgentContext({
        tenantId: "",
        userId: "user-1",
        role: "owner",
        permissions: [],
        autonomyLevel: "high",
      }),
    ).toThrow(/tenantId/);
  });

  it("rejects empty userId", () => {
    expect(() =>
      createAgentContext({
        tenantId: "tenant-1",
        userId: "",
        role: "owner",
        permissions: [],
        autonomyLevel: "high",
      }),
    ).toThrow(/userId/);
  });

  it("rejects empty role", () => {
    expect(() =>
      createAgentContext({
        tenantId: "tenant-1",
        userId: "user-1",
        role: "",
        permissions: [],
        autonomyLevel: "high",
      }),
    ).toThrow(/role/);
  });

  it("does not allow mutation of tenantId on the frozen context", () => {
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
      permissions: [],
      autonomyLevel: "high",
    });
    // In strict-mode ES modules, assigning to a frozen property throws;
    // vitest runs ESM strict by default.
    expect(() => {
      (ctx as { tenantId: string }).tenantId = "tenant-evil";
    }).toThrow();
    expect(ctx.tenantId).toBe("tenant-1");
  });

  it("copies the permissions array (defensive against later caller mutation)", () => {
    const perms = ["schedule:read"];
    const ctx = createAgentContext({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
      permissions: perms,
      autonomyLevel: "high",
    });
    // The caller's array is not held by reference.
    perms.push("billing:write");
    expect(ctx.permissions).toEqual(["schedule:read"]);
  });
});
