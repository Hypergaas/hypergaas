import type { Metadata } from "next";
import "./globals.css";

// Metadata is placeholder. Title/description copy is GTM's (post-approval),
// not written in this scaffold. Tagline lean (GTM input, not locked here):
// "The agent stack for SaaS that's already shipped."
export const metadata: Metadata = {
  title: "HyperGaaS — the agent stack for SaaS that's already shipped",
  description:
    "Add agents to your multi-tenant SaaS without rewriting your service layer. " +
    "Annotate a method you already have; HyperGaaS derives the tool schema, scopes " +
    "every call to the right tenant, checks permissions, and writes the audit log.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
