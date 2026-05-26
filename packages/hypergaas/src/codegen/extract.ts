// Layer 4 — Schema codegen (ts-morph build-time extraction).
//
// Reflection mechanism: ts-morph build-time codegen (approved.jsonl line 2;
// ADR `sdk/docs/decisions/v0.1-build-stack.md` § "Reflection mechanism").
// reflect-metadata was DISQUALIFIED (erases generics, ties us to
// experimentalDecorators) and manual zod was DISQUALIFIED (forces parallel
// schema definition = the schema-drift the registry exists to eliminate).
// ts-morph is the only path that preserves the developer's literal TS type in
// the emitted tool schema AND is compatible with the TC39 stage-3 decorator
// signature (spec §3.b).
//
// Walks the developer's source AST, finds `@agentAction(...)`-decorated
// methods, derives the params (`P`) JSON schema from the method's second
// parameter, and emits one artifact (`hypergaas.actions.json`) the runtime loads
// at `createActionRegistry()` time. NO runtime reflection; NO running the
// developer's code.
//
// Enforces the STRICT-EMITTER rule (approved.jsonl line 3; spec §3.c; ADR
// § "Strict-emitter rule"): `audienceRoles` must be a literal array of role
// keys / `audience.self(...)` entries at the decoration site. Computed
// expressions are a hard build error.

import {
  Node,
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type Decorator,
  type MethodDeclaration,
  type SourceFile,
  type Type,
} from "ts-morph";

/** The exact build-error message the strict-emitter rule mandates (ADR
 *  § "Strict-emitter rule"; spec §3.c). Kept as a constant so the runtime
 *  test and the CLI assert against the same string. */
export const NON_LITERAL_AUDIENCE_MESSAGE =
  "audienceRoles must be a literal array of role keys; compute audiences via audience.self(...) predicates instead, or inline the literal array";

/** A single extracted action's emitted schema entry. */
export interface ActionSchema {
  /** ClassName.methodName (or the explicit `actionKey` override). */
  readonly key: string;
  readonly className: string;
  readonly methodName: string;
  readonly description: string;
  /** JSON-Schema-ish shape derived from the method's `params` (`P`) type. */
  readonly paramsSchema: JsonSchema;
}

/** The emitted artifact. `version` lets the runtime detect a stale artifact. */
export interface ActionsArtifact {
  readonly version: 1;
  readonly actions: readonly ActionSchema[];
}

/** A build error raised by the strict emitter. Carries the source location so
 *  the developer sees exactly which decoration site is non-literal. */
export class CodegenError extends Error {
  readonly filePath: string;
  readonly line: number;
  constructor(message: string, filePath: string, line: number) {
    super(`${message}\n  at ${filePath}:${line}`);
    this.name = "CodegenError";
    this.filePath = filePath;
    this.line = line;
  }
}

// ── Minimal JSON-Schema subset we emit ──────────────────────────────────────
// Enough for v0.1 tool-schema serialization; the runtime's provider-specific
// serializers (OpenAI / Anthropic) narrow this canonical shape (spec §3.b).
export type JsonSchema =
  | { readonly type: "string" }
  | { readonly type: "number" }
  | { readonly type: "boolean" }
  | { readonly type: "null" }
  | { readonly type: "string"; readonly format: "date-time" }
  | { readonly type: "array"; readonly items: JsonSchema }
  | {
      readonly type: "object";
      readonly properties: Readonly<Record<string, JsonSchema>>;
      readonly required: readonly string[];
    }
  | { readonly type: "unknown" };

/**
 * Extract action schemas from the given tsconfig. Pure-ish: builds an
 * in-memory ts-morph Project, walks decorated methods, returns the artifact.
 * Throws `CodegenError` on the first non-literal `audienceRoles` (strict
 * emitter). Does not write to disk — the CLI wrapper does that.
 */
export function extractActions(tsConfigFilePath: string): ActionsArtifact {
  const project = new Project({ tsConfigFilePath });
  return extractFromProject(project);
}

/**
 * Core extraction over a ready-made `Project`. Exposed separately so tests can
 * construct an in-memory project (`useInMemoryFileSystem`) without a tsconfig
 * on disk.
 */
export function extractFromProject(project: Project): ActionsArtifact {
  const actions: ActionSchema[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    collectFromSourceFile(sourceFile, actions);
  }
  // Deterministic order so the emitted artifact is diff-stable.
  actions.sort((a, b) => a.key.localeCompare(b.key));
  return { version: 1, actions };
}

function collectFromSourceFile(
  sourceFile: SourceFile,
  out: ActionSchema[],
): void {
  // Descendants (not just `getClasses()`) so the extractor finds decorated
  // methods on top-level classes (the canonical developer pattern, spec §7)
  // AND on classes declared inside a factory function body (the PoC's TS4094
  // concession). The developer's real-world shape is a module-scope class; the
  // factory shape is what the PoC uses for anonymous export. Handling both is
  // strictly safer than assuming top-level only.
  const classes = sourceFile.getDescendantsOfKind(
    SyntaxKind.ClassDeclaration,
  ) as ClassDeclaration[];
  for (const cls of classes) {
    const className = cls.getName() ?? "AnonymousService";
    for (const method of cls.getMethods()) {
      const decorator = findAgentActionDecorator(method);
      if (decorator === undefined) continue;
      out.push(extractAction(className, method, decorator, sourceFile));
    }
  }
}

/** Find the `@agentAction(...)` decorator on a method, if present. We match by
 *  the decorator's call-expression identifier name — `agentAction` — which
 *  covers both the registry-bound destructured form and any aliased import. */
function findAgentActionDecorator(
  method: MethodDeclaration,
): Decorator | undefined {
  for (const dec of method.getDecorators()) {
    if (dec.getName() === "agentAction") return dec;
  }
  return undefined;
}

function extractAction(
  className: string,
  method: MethodDeclaration,
  decorator: Decorator,
  sourceFile: SourceFile,
): ActionSchema {
  const methodName = method.getName();
  const optionsArg = decorator.getArguments()[0];
  if (optionsArg === undefined || !Node.isObjectLiteralExpression(optionsArg)) {
    throw new CodegenError(
      "@agentAction() requires an options object literal at the decoration site",
      sourceFile.getFilePath(),
      decorator.getStartLineNumber(),
    );
  }

  // ── Strict-emitter rule (spec §3.c) ──────────────────────────────────────
  // `audienceRoles` must be a LITERAL array. A computed expression (function
  // call, spread from an imported binding, conditional) cannot be statically
  // resolved without running the developer's code, so it is a hard build error.
  assertLiteralAudienceRoles(optionsArg, sourceFile);

  const description = readStringProperty(optionsArg, "description") ?? "";
  const actionKey = readStringProperty(optionsArg, "actionKey");
  const key = actionKey ?? `${className}.${methodName}`;

  // Derive the params (`P`) schema from the method's SECOND parameter (the
  // first is always `ctx: AgentContext`). This preserves the developer's exact
  // literal TS type — the whole point of ts-morph over reflect-metadata.
  const paramsSchema = deriveParamsSchema(method);

  return { key, className, methodName, description, paramsSchema };
}

/**
 * Strict-emitter enforcement. `audienceRoles` initializer must be an array
 * literal whose entries are each either a string literal (a role key) or a
 * call expression (an `audience.self(...)` predicate — treated as a black-box
 * entry; the emitter does not introspect its body, per ADR § "Strict-emitter
 * rule"). Anything else → `CodegenError` with the mandated message.
 */
function assertLiteralAudienceRoles(
  optionsArg: Node,
  sourceFile: SourceFile,
): void {
  if (!Node.isObjectLiteralExpression(optionsArg)) return;
  const prop = optionsArg.getProperty("audienceRoles");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    throw new CodegenError(
      "@agentAction() requires an `audienceRoles` property",
      sourceFile.getFilePath(),
      optionsArg.getStartLineNumber(),
    );
  }
  const initializer = prop.getInitializer();
  if (initializer === undefined || !Node.isArrayLiteralExpression(initializer)) {
    // Computed audiences: `audienceRoles: getAudienceFor("schedule:read")`,
    // a const reference that isn't an inline array literal, etc. Hard error.
    throw new CodegenError(
      NON_LITERAL_AUDIENCE_MESSAGE,
      sourceFile.getFilePath(),
      prop.getStartLineNumber(),
    );
  }
  for (const element of initializer.getElements()) {
    const isStringLiteral =
      Node.isStringLiteral(element) ||
      Node.isNoSubstitutionTemplateLiteral(element);
    const isCall = Node.isCallExpression(element); // audience.self(...)
    if (Node.isSpreadElement(element)) {
      // `[...baseAudience, "owner"]` — spread can't be statically resolved.
      throw new CodegenError(
        NON_LITERAL_AUDIENCE_MESSAGE,
        sourceFile.getFilePath(),
        element.getStartLineNumber(),
      );
    }
    if (!isStringLiteral && !isCall) {
      throw new CodegenError(
        NON_LITERAL_AUDIENCE_MESSAGE,
        sourceFile.getFilePath(),
        element.getStartLineNumber(),
      );
    }
  }
}

function readStringProperty(
  obj: Node,
  name: string,
): string | undefined {
  if (!Node.isObjectLiteralExpression(obj)) return undefined;
  const prop = obj.getProperty(name);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) return undefined;
  const init = prop.getInitializer();
  if (init === undefined) return undefined;
  if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init)) {
    return init.getLiteralText();
  }
  return undefined;
}

/** Derive the JSON schema for the method's `params` (second) parameter. */
function deriveParamsSchema(method: MethodDeclaration): JsonSchema {
  const params = method.getParameters();
  const paramsParam = params[1]; // [0] is ctx: AgentContext
  if (paramsParam === undefined) {
    // No params parameter — an action that takes only ctx. Empty object shape.
    return { type: "object", properties: {}, required: [] };
  }
  return typeToJsonSchema(paramsParam.getType());
}

/** Map a ts-morph `Type` to our minimal JSON-Schema subset. Conservative:
 *  unknown/complex types degrade to `{ type: "unknown" }` rather than throwing
 *  — schema fidelity is best-effort in v0.1; the strict gate is on
 *  `audienceRoles`, not on exotic param types. */
function typeToJsonSchema(type: Type): JsonSchema {
  // An optional property (`active?: boolean`) resolves to `boolean | undefined`.
  // Optionality is captured separately via the `required` list, so strip the
  // `undefined`/`null` arms here and emit the schema for the remaining member.
  // A genuine multi-arm union (e.g. `string | number`) we cannot represent in
  // the v0.1 minimal subset degrades to `{ type: "unknown" }`.
  if (type.isUnion()) {
    const nonNullish = type
      .getUnionTypes()
      .filter((t) => !t.isUndefined() && !t.isNull());
    if (nonNullish.length === 1 && nonNullish[0] !== undefined) {
      return typeToJsonSchema(nonNullish[0]);
    }
    // `boolean` itself is modeled internally as `true | false`; collapse it.
    if (nonNullish.every((t) => t.isBooleanLiteral()) && nonNullish.length > 0) {
      return { type: "boolean" };
    }
    return { type: "unknown" };
  }

  if (type.isString() || type.isStringLiteral()) return { type: "string" };
  if (type.isNumber() || type.isNumberLiteral()) return { type: "number" };
  if (type.isBoolean() || type.isBooleanLiteral()) return { type: "boolean" };
  if (type.isNull() || type.isUndefined()) return { type: "null" };

  if (type.isArray()) {
    const elem = type.getArrayElementType();
    return {
      type: "array",
      items: elem ? typeToJsonSchema(elem) : { type: "unknown" },
    };
  }

  // `Date` and other class types: emit a string/date-time hint where we can
  // recognize it, else fall through to object/unknown.
  const symbolName = type.getSymbol()?.getName();
  if (symbolName === "Date") {
    return { type: "string", format: "date-time" };
  }

  if (type.isObject() || type.isInterface()) {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const prop of type.getProperties()) {
      const decls = prop.getDeclarations();
      const decl = decls[0];
      if (decl === undefined) continue;
      const propType = prop.getTypeAtLocation(decl);
      properties[prop.getName()] = typeToJsonSchema(propType);
      if (!prop.isOptional()) required.push(prop.getName());
    }
    return { type: "object", properties, required };
  }

  return { type: "unknown" };
}
