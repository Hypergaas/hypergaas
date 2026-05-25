// Schema codegen + strict-emitter rule (ts-morph build-time extraction).
//
// The directive's explicit coverage requirement: "the strict-emitter build-
// error path (computed `audienceRoles` must raise a build error)" — per
// approved.jsonl line 3 + spec §3.c + the ADR § "Strict-emitter rule".
//
// We build in-memory ts-morph projects (no tsconfig on disk) and run
// `extractFromProject` directly so the cases are fast and hermetic.

import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import {
  CodegenError,
  NON_LITERAL_AUDIENCE_MESSAGE,
  extractFromProject,
} from "../codegen/extract.js";

/** Build an in-memory ts-morph project from a single source string. */
function projectWith(source: string): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true, target: 99 /* ESNext */ },
  });
  project.createSourceFile("service.ts", source);
  return project;
}

// A minimal stand-in for the SDK's decorator binding. The extractor matches by
// the decorator's call-expression name (`agentAction`); it does not need the
// real implementation in scope to walk the AST.
const PREAMBLE = `
declare const agentAction: any;
declare const audience: { self: (check: any, label?: string) => any };
declare function getAudienceFor(p: string): any;
interface AgentContext { tenantId: string; userId: string; }
const baseAudience = ["dispatcher"];
`;

describe("codegen — strict-emitter rule (spec §3.c)", () => {
  it("extracts an action with a LITERAL audienceRoles array", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "Get a tech's schedule",
          reversibility: "idempotent",
          requiredPermissions: ["schedule:read"],
          audienceRoles: ["dispatcher", "owner"],
          costWeight: 1,
        })
        async getTechSchedule(ctx: AgentContext, params: { techId: string }) {
          return [];
        }
      }
    `);
    const artifact = extractFromProject(project);
    expect(artifact.version).toBe(1);
    expect(artifact.actions).toHaveLength(1);
    expect(artifact.actions[0]?.key).toBe("JobService.getTechSchedule");
    expect(artifact.actions[0]?.description).toBe("Get a tech's schedule");
  });

  it("allows audience.self(...) predicate ENTRIES inside the literal array", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "self ok",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: [
            "owner",
            audience.self((ctx: AgentContext, p: { techId: string }) => ctx.userId === p.techId, "self"),
          ],
          costWeight: 1,
        })
        async m(ctx: AgentContext, params: { techId: string }) { return []; }
      }
    `);
    const artifact = extractFromProject(project);
    // The emitter treats audience.self(...) as a black-box entry (ADR
    // § "Strict-emitter rule") — it does not introspect the predicate body.
    expect(artifact.actions).toHaveLength(1);
  });

  it("RAISES on a computed audienceRoles (function call result)", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "computed",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: getAudienceFor("schedule:read"),
          costWeight: 1,
        })
        async m(ctx: AgentContext, params: { techId: string }) { return []; }
      }
    `);
    expect(() => extractFromProject(project)).toThrow(CodegenError);
    // The exact mandated message (ADR § "Strict-emitter rule"; spec §3.c).
    expect(() => extractFromProject(project)).toThrow(
      NON_LITERAL_AUDIENCE_MESSAGE,
    );
  });

  it("RAISES on a const-reference audienceRoles (not an inline literal)", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "const ref",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: baseAudience,
          costWeight: 1,
        })
        async m(ctx: AgentContext, params: { techId: string }) { return []; }
      }
    `);
    expect(() => extractFromProject(project)).toThrow(CodegenError);
    expect(() => extractFromProject(project)).toThrow(
      NON_LITERAL_AUDIENCE_MESSAGE,
    );
  });

  it("RAISES on a spread inside the audienceRoles array", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "spread",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: [...baseAudience, "owner"],
          costWeight: 1,
        })
        async m(ctx: AgentContext, params: { techId: string }) { return []; }
      }
    `);
    expect(() => extractFromProject(project)).toThrow(CodegenError);
    expect(() => extractFromProject(project)).toThrow(
      NON_LITERAL_AUDIENCE_MESSAGE,
    );
  });

  it("the CodegenError carries the source file + line for the developer", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "computed",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: getAudienceFor("x"),
          costWeight: 1,
        })
        async m(ctx: AgentContext, params: { techId: string }) { return []; }
      }
    `);
    try {
      extractFromProject(project);
      throw new Error("expected CodegenError");
    } catch (e) {
      expect(e).toBeInstanceOf(CodegenError);
      if (e instanceof CodegenError) {
        expect(e.filePath).toContain("service.ts");
        expect(e.line).toBeGreaterThan(0);
      }
    }
  });
});

describe("codegen — schema derivation from TS types (no schema drift)", () => {
  it("derives a JSON schema from the literal params type", () => {
    const project = projectWith(`${PREAMBLE}
      class JobService {
        @agentAction({
          description: "derive",
          reversibility: "idempotent",
          requiredPermissions: [],
          audienceRoles: ["owner"],
          costWeight: 1,
        })
        async m(
          ctx: AgentContext,
          params: { techId: string; count: number; active?: boolean },
        ) { return []; }
      }
    `);
    const artifact = extractFromProject(project);
    const schema = artifact.actions[0]?.paramsSchema;
    expect(schema).toEqual({
      type: "object",
      properties: {
        techId: { type: "string" },
        count: { type: "number" },
        active: { type: "boolean" },
      },
      // optional `active` is NOT required — derived from the `?` on the type.
      required: ["techId", "count"],
    });
  });

  it("emits actions in deterministic key order", () => {
    const project = projectWith(`${PREAMBLE}
      class ZService {
        @agentAction({ description: "z", reversibility: "idempotent", requiredPermissions: [], audienceRoles: ["owner"], costWeight: 1 })
        async zzz(ctx: AgentContext, p: { a: string }) { return 1; }
      }
      class AService {
        @agentAction({ description: "a", reversibility: "idempotent", requiredPermissions: [], audienceRoles: ["owner"], costWeight: 1 })
        async aaa(ctx: AgentContext, p: { a: string }) { return 1; }
      }
    `);
    const keys = extractFromProject(project).actions.map((a) => a.key);
    expect(keys).toEqual(["AService.aaa", "ZService.zzz"]);
  });
});
