// Layer 4 — Schema codegen CLI (`gaasdk extract`).
//
// Build-time entry point. Invoked by `pnpm run codegen`, which `pnpm run
// build` runs BEFORE `tsc` (option A — codegen → tsc sequence, approved.jsonl
// line 7; ADR § "Staging plan", `pnpm run codegen` row). The strict emitter
// (extract.ts) raises a `CodegenError` on a non-literal `audienceRoles`; this
// wrapper prints the message and exits non-zero so the build fails AT the
// codegen step with a clear, distinct error — not a confusing downstream tsc
// failure.
//
// Usage:
//   gaasdk-extract [--tsconfig <path>] [--out <path>]
// Defaults: --tsconfig ./tsconfig.json   --out ./gaasdk.actions.json

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CodegenError, extractActions } from "./extract.js";

interface CliArgs {
  readonly tsConfig: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let tsConfig = "tsconfig.json";
  let out = "gaasdk.actions.json";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tsconfig") {
      const next = argv[i + 1];
      if (next !== undefined) {
        tsConfig = next;
        i += 1;
      }
    } else if (arg === "--out") {
      const next = argv[i + 1];
      if (next !== undefined) {
        out = next;
        i += 1;
      }
    }
  }
  return { tsConfig: resolve(tsConfig), out: resolve(out) };
}

export function runCli(argv: readonly string[]): number {
  const { tsConfig, out } = parseArgs(argv);
  try {
    const artifact = extractActions(tsConfig);
    writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[gaasdk] extracted ${artifact.actions.length} action(s) → ${out}`,
    );
    return 0;
  } catch (cause: unknown) {
    if (cause instanceof CodegenError) {
      // eslint-disable-next-line no-console
      console.error(`[gaasdk] codegen failed: ${cause.message}`);
      return 1;
    }
    // eslint-disable-next-line no-console
    console.error(
      `[gaasdk] codegen failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return 1;
  }
}

// Direct-execution entry. `process.argv.slice(2)` drops node + script path.
// Guarded so importing this module (e.g. in a test) does not run the CLI.
if (
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("cli.js")
) {
  process.exit(runCli(process.argv.slice(2)));
}
