// gaasdk — v0.1 PUBLIC surface.
//
// This is the first commit that publishes `@agentAction()`'s public type
// signature (ship CHARTER § "v0.1 public API — locked inclusions"; batch item
// #5, approved.jsonl line 8). The public surface is the registry-aware action
// registry + the typed role registry, per
// `domains/engineering/decisions/role-registry.md` and
// `sdk/docs/specs/action-registry.md` §1 + §6.a.
//
// Locked invariant (CONSTITUTION § Hard nos): NO `any` in this surface;
// TypeScript strict throughout.

// ── Role registry (the typed audience primitives) ──────────────────────────
// `defineRoles` + `audience` (values); `RoleConfig`, `RoleOf<>`,
// `AudiencePredicate<P>` (exported per approved.jsonl line 6), `Audience<R,P>`,
// `AutonomyLevel`, `RoleRegistry` (types).
export { defineRoles, audience } from "./integration/role-registry/index.js";
export type {
  Audience,
  AudiencePredicate,
  AutonomyLevel,
  RoleConfig,
  RoleOf,
  RoleRegistry,
} from "./integration/role-registry/index.js";

// ── Action registry (the registry-aware @agentAction decorator) ─────────────
// `createActionRegistry(roles)` returns `{ agentAction, invoke, get, list }`.
// The bound `agentAction` types `audienceRoles` as `Audience<R, P>[]`.
export {
  createActionRegistry,
  type BoundActionRegistry,
  type CreateActionRegistryOptions,
} from "./integration/action-registry/index.js";
export type {
  AgentActionDecorator,
  AgentActionOptions,
  Reversibility,
} from "./integration/action-registry/index.js";

// ── Multi-tenant context ────────────────────────────────────────────────────
// `createAgentContext(...)` — the only authoritative source of tenant identity
// inside an action body (spec §4). Frozen at construction.
export { createAgentContext } from "./runtime/context/create-agent-context.js";
export type {
  AgentContext,
  CreateAgentContextInput,
} from "./runtime/context/types.js";

// ── Result + error model ────────────────────────────────────────────────────
// Gate failures resolve as `Result<T, ActionError>` — typed, not thrown
// (spec §2.c). The `PauseForApproval.suspension` payload is part of the v0.1
// surface (forward-extended for workflow-engine resumability).
export type {
  ActionError,
  Err,
  Ok,
  Result,
} from "./runtime/result/types.js";
export { err, isErr, isOk, ok } from "./runtime/result/helpers.js";

// ── Audit ───────────────────────────────────────────────────────────────────
// `InMemoryAuditLogger` ships as the v0.1 reference implementation; durable
// backends (Postgres/SQLite) drop in behind the same `AuditLogger` interface.
export { InMemoryAuditLogger } from "./runtime/audit/in-memory-audit-logger.js";
export type {
  AuditEvent,
  AuditEventKind,
  AuditLogger,
} from "./runtime/audit/types.js";

// ── Schema codegen (build-time) ─────────────────────────────────────────────
// The `gaasdk-extract` CLI (ts-morph) is the build-time entry; this re-exports
// the programmatic API + the strict-emitter error so build tooling can embed
// it. Runtime schema validation consumes the emitted `gaasdk.actions.json`.
export {
  CodegenError,
  NON_LITERAL_AUDIENCE_MESSAGE,
  extractActions,
  extractFromProject,
  type ActionSchema,
  type ActionsArtifact,
  type JsonSchema,
} from "./codegen/extract.js";
