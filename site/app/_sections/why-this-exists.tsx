// Section 2 — Why this exists.
// Directive spec: name the SaaS multi-tenant gap directly. OpenAI Agents SDK /
// LangGraph / CrewAI are all built for "agents from scratch" — none solve
// "add agents to my existing multi-tenant SaaS." Posture per
// domains/marketing/CONTEXT.md: name OpenAI directly, contest substantively;
// other competitors get fair treatment.
// The jab framing + all prose are GTM's. Structural shell only.
export function WhyThisExists() {
  return (
    <section aria-labelledby="why-heading" className="flex flex-col gap-6">
      <h2 id="why-heading" className="text-3xl font-semibold tracking-tight">
        Every agent SDK was built for agents from scratch. You already have a product.
      </h2>

      <div className="flex max-w-2xl flex-col gap-4 text-neutral-600">
        <p>
          You have tenants. You have a permission system. You have a service layer with
          dozens of methods and an audit trail your customers — sometimes your regulators —
          expect. The problem isn&apos;t building an agent. It&apos;s running one{" "}
          <em>inside</em> the product you already shipped: on the same tenant scoping, the
          same RBAC, the same business logic your human users run on.
        </p>
        <p>
          No agent SDK solves this. They assume you&apos;re starting from nothing. So for
          every method you want an agent to call, you write it three times: the real
          service method, a parallel JSON schema that drifts the moment you add a field,
          and a handler that hand-threads <code>tenantId</code>, copy-pastes the permission
          check, and bolts on audit logging. Miss the tenant ID once and you have a
          cross-tenant data leak — a P0 incident in any multi-tenant SaaS. Those wrappers
          become a second service layer that drifts from your real one, and the cost of the
          tenth agent feature never comes down.
        </p>
        <p>
          <strong>OpenAI&apos;s Agents SDK is the loudest version of this gap.</strong> Four
          primitives, marketed as the default way to build agents — and every SaaS team that
          reaches for it walks straight into rebuilding tenant context, permission checks,
          audit logging, and reversibility gating by hand, because the SDK has no concept of
          any of them. Its provider-agnosticism is a claim retrofitted onto an OpenAI-first
          design. We don&apos;t say that as a take; we built the alternative. Our proof-of-
          concept runs two tenants in one process with structurally impossible cross-tenant
          leaks via the agent path, permission and reversibility gating enforced at runtime,
          and paired audit records — 49 passing tests, no <code>any</code> in the public
          surface. HyperGaaS ships the layer OpenAI makes you rebuild.
        </p>
        <p>
          The others are closer to right, and we credit them where they are. LangGraph is
          production-grade for graph-based state machines — but it&apos;s general-purpose
          orchestration with a steep curve and no multi-tenant primitives. CrewAI is great
          for fast role-based prototyping, and teams routinely outgrow it at production
          scale. Mem0 and Zep solved real problems in agent memory and informed how we think
          about tenant-scoped memory. None of them are a SaaS integration layer. That gap is
          the whole reason HyperGaaS exists.
        </p>
      </div>
    </section>
  );
}
