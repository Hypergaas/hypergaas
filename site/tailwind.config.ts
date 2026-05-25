import type { Config } from "tailwindcss";

// v0.1 aesthetic (per coordinator/directives/2026-05-21-externalization.md § Landing page):
// one font (Geist/Inter), ONE accent color, generous whitespace, monospace for code blocks.
// Lovable/Cursor lineage. No stock photography. No robot illustrations.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // single accent color — placeholder value; GTM/design confirms the final hex.
        accent: {
          DEFAULT: "#6366f1",
          fg: "#ffffff",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
