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
        {/* TODO(gtm): section heading */}
      </h2>
      {/* TODO(gtm): the multi-tenant gap, named directly.
          OpenAI named + contested substantively (marketing CONTEXT posture).
          LangGraph / CrewAI: fair treatment. */}
      <div className="flex flex-col gap-4 text-neutral-600">
        <p>{/* TODO(gtm): the gap statement */}</p>
        <p>{/* TODO(gtm): the OpenAI jab (substantive, earned by the PoC) */}</p>
      </div>
    </section>
  );
}
