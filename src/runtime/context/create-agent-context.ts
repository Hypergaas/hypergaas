// Layer 1 — Runtime / createAgentContext.
//
// Per spec §4: non-empty tenantId is validated at construction; the returned
// object is frozen (Object.freeze runs deep on the one nested object). Any
// attempt to mutate raises in strict mode and is a no-op otherwise.
//
// No `invokeAs(fakeCtx)` surface exists anywhere in the registry — context
// construction is the only entry point. Developer code that constructs its
// own AgentContext literal still goes through this function (or it doesn't
// pass the type check at the decorator boundary).

import type { AgentContext, CreateAgentContextInput } from "./types.js";

/**
 * Construct a frozen AgentContext.
 *
 * Throws synchronously when invariants are violated — this is construction
 * time, not invocation time. The throw is appropriate here: a caller that
 * passes an empty tenantId has a bug, not a runtime gate failure to recover
 * from. The registry's gate sequence catches scoped-tenant violations at
 * invocation time and returns them as typed errors.
 */
export function createAgentContext(input: CreateAgentContextInput): AgentContext {
  if (typeof input.tenantId !== "string" || input.tenantId.length === 0) {
    throw new Error(
      "createAgentContext: tenantId must be a non-empty string. " +
        "AgentContext is the only authoritative source of tenant identity; " +
        "constructing one without a tenantId would defeat tenant scoping.",
    );
  }
  if (typeof input.userId !== "string" || input.userId.length === 0) {
    throw new Error("createAgentContext: userId must be a non-empty string.");
  }
  if (typeof input.role !== "string" || input.role.length === 0) {
    throw new Error("createAgentContext: role must be a non-empty string.");
  }

  const ctx: AgentContext = {
    tenantId: input.tenantId,
    userId: input.userId,
    role: input.role,
    permissions: Object.freeze([...input.permissions]),
    tenant: Object.freeze({ autonomyLevel: input.autonomyLevel }),
  };
  return Object.freeze(ctx);
}
