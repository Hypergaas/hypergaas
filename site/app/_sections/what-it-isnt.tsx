// Section 4 — What it isn't.
// Directive spec (defensive): "this is not a workflow engine — it's the SaaS
// integration layer for one. Use it with Temporal / your existing service layer."
// Defends against the inevitable "is this another LangChain?" question.
// Prose is GTM's. Structural shell only.
export function WhatItIsnt() {
  return (
    <section aria-labelledby="what-it-isnt-heading" className="flex flex-col gap-6">
      <h2 id="what-it-isnt-heading" className="text-3xl font-semibold tracking-tight">
        What it isn&apos;t
      </h2>

      <div className="flex max-w-2xl flex-col gap-4 text-neutral-600">
        <p>
          HyperGaaS is not a workflow engine, and it&apos;s not trying to replace your stack.
          It&apos;s the SaaS integration layer that makes your existing service layer
          agent-callable — safely, with tenant scoping, permissions, reversibility classes,
          and audit logging built into the action model at declaration time.
        </p>
        <p>
          It is not another general-purpose orchestration framework. If you need durable,
          long-running workflow execution, run it on something built for that — Temporal, or
          whatever your team already trusts. HyperGaaS sits at the boundary where an agent
          meets your business logic: it turns the methods you already have into governed
          actions. Use it alongside your service layer and your workflow engine, not instead
          of them.
        </p>
      </div>
    </section>
  );
}
