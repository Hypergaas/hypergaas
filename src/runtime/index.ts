// Layer 1 — Runtime. Thin, model-agnostic orchestration loop.
// Locked invariant (domains/engineering/CONTEXT.md): no design choice in this
// layer may tie the SDK to a single model provider.
//
// PoC internal re-exports. These are NOT the v0.1 public surface — the
// public surface is `approve`-tier and is gated on a working PoC. See
// `sdk/docs/specs/action-registry.md` §8.a staging table.

export type {
  AgentContext,
  AutonomyLevel,
  CreateAgentContextInput,
} from "./context/types.js";
export { createAgentContext } from "./context/create-agent-context.js";

export type {
  ActionError,
  Err,
  Ok,
  Result,
} from "./result/types.js";
export { err, isErr, isOk, ok } from "./result/helpers.js";

export type {
  AuditEvent,
  AuditEventKind,
  AuditLogger,
} from "./audit/types.js";
export { InMemoryAuditLogger } from "./audit/in-memory-audit-logger.js";

export type {
  ActionDescriptor,
  AgentActionOptionsInternal,
  AudienceEntryInternal,
  AudiencePredicate,
  Reversibility,
} from "./action-registry/types.js";
export {
  ActionRegistry,
  selfAudience,
} from "./action-registry/registry.js";
export type {
  ActionRegistryDeps,
  RoleConfigEntry,
  RoleConfigMap,
} from "./action-registry/registry.js";
export { createAgentActionDecorator } from "./action-registry/agent-action.js";
