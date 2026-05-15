// Layer 4 — SaaS Integration Layer. Action registry (`@agentAction()`),
// multi-tenant context (`createAgentContext(tenantId, userId)`), and the
// React integration (`<AgentPanel>`, `useAgent()`).
//
// The first commit that publishes `@agentAction()`'s public type signature
// must ship the typed role registry — see
// `domains/engineering/decisions/role-registry.md` and the spec at
// `sdk/docs/specs/action-registry.md`. That commit is `approve`-tier.
export {};
