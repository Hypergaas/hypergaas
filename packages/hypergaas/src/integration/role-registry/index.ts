// Layer 4 — SaaS Integration / Role registry (v0.1 PUBLIC surface barrel).
//
// Re-exports the role-typing primitives that v0.1 publishes:
//   defineRoles, audience  (value exports)
//   RoleConfig, RoleOf<>, AudiencePredicate<P>, Audience<R,P>, AutonomyLevel,
//   RoleRegistry  (type exports)
//
// `AudiencePredicate<P>` is exported per approved.jsonl line 6.

export { defineRoles, audience } from "./define-roles.js";
export type {
  AudiencePredicate,
  Audience,
  AutonomyLevel,
  RoleConfig,
  RoleOf,
  RoleRegistry,
} from "./types.js";
