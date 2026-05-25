import type { Metadata } from "next";
import "./globals.css";

// Metadata is placeholder. Title/description copy is GTM's (post-approval),
// not written in this scaffold. Tagline lean (GTM input, not locked here):
// "The agent stack for SaaS that's already shipped."
export const metadata: Metadata = {
  title: "HyperGaaS", // TODO(gtm): final title + tagline
  description: "", // TODO(gtm): meta description — see directive § Landing page
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
