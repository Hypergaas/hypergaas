import { Hero } from "./_sections/hero";
import { WhyThisExists } from "./_sections/why-this-exists";
import { Quickstart } from "./_sections/quickstart";
import { WhatItIsnt } from "./_sections/what-it-isnt";
import { DocsAndGithub } from "./_sections/docs-and-github";

// v0.1 landing page — section skeleton ONLY.
// Order per coordinator/directives/2026-05-21-externalization.md § "Landing page v0.1".
// Copy is written by the GTM cycle (inaugural dispatch, post-batch-approval).
// Each section below carries TODO(gtm) markers; no prose is authored in this scaffold.
export default function Page() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-32 px-6 py-24">
      <Hero />
      <WhyThisExists />
      <Quickstart />
      <WhatItIsnt />
      <DocsAndGithub />
    </main>
  );
}
