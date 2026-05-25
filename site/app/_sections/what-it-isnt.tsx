// Section 4 — What it isn't.
// Directive spec (defensive): "this is not a workflow engine — it's the SaaS
// integration layer for one. Use it with Temporal / your existing service layer."
// Defends against the inevitable "is this another LangChain?" question.
// Prose is GTM's. Structural shell only.
export function WhatItIsnt() {
  return (
    <section aria-labelledby="what-it-isnt-heading" className="flex flex-col gap-6">
      <h2 id="what-it-isnt-heading" className="text-3xl font-semibold tracking-tight">
        {/* TODO(gtm): section heading */}
      </h2>
      {/* TODO(gtm): defensive framing — not a workflow engine; the SaaS integration
          layer for one. Pairs with Temporal / the developer's existing service layer.
          Defuses "is this another LangChain?" */}
      <p className="text-neutral-600">{/* TODO(gtm): the framing */}</p>
    </section>
  );
}
