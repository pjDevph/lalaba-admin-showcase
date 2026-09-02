/**
 * Regenerates src/lib/backend-roles.generated.ts from the backend's resolvers.
 *
 * The admin panel's capability map is only meaningful if it mirrors the
 * backend's @Roles(...) guards — that is the actual security boundary, and a
 * UI capability that grants more than its guard produces a control that 403s
 * on click (or, worse, a table that renders "none yet" on a rejected fetch).
 * This walks every *.resolver.ts, pairs each @Query/@Mutation root field with
 * the roles allowed to call it, and writes the result out for the coverage
 * test to check the UI against.
 *
 * Usage:  node scripts/extract-backend-roles.mjs [--check]
 *   --check  exit 1 if the committed file is stale instead of rewriting it
 *
 * Requires LALABA_BE_DEV checked out beside this repo (override with
 * LALABA_BE_PATH). The generated file is committed so the test can run
 * without it.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL_ROOT = join(HERE, "..");
const BE_ROOT =
  process.env.LALABA_BE_PATH ?? join(PANEL_ROOT, "..", "LALABA_BE_DEV");
const OUT = join(PANEL_ROOT, "src", "lib", "backend-roles.generated.ts");

if (!existsSync(BE_ROOT)) {
  console.error(`Backend not found at ${BE_ROOT}. Set LALABA_BE_PATH.`);
  process.exit(2);
}

const files = globSync("src/**/*.resolver.ts", { cwd: BE_ROOT }).sort();
if (files.length === 0) {
  console.error(`No resolvers found under ${BE_ROOT}/src.`);
  process.exit(2);
}

/** Decorator name, e.g. `@Roles('admin')` -> "Roles". */
function decoratorName(dec) {
  const expr = ts.isCallExpression(dec.expression)
    ? dec.expression.expression
    : dec.expression;
  return ts.isIdentifier(expr) ? expr.text : undefined;
}

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function findDecorator(node, name) {
  return decoratorsOf(node).find((d) => decoratorName(d) === name);
}

/**
 * File-scoped `const X = ['a', 'b']` role lists, so `@Roles(...PROVIDER_ROLES)`
 * can be resolved to the roles it actually names.
 *
 * Deliberately per-file: PROVIDER_ROLES is ['merchant','washer','staff'] in
 * online-orders.resolver.ts and ['merchant','washer'] in ratings.resolver.ts.
 * A single global table would silently pick one and mislabel the other.
 */
function collectRoleConstants(source) {
  const consts = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      let init = node.initializer;
      // Unwrap `as const`.
      if (init && ts.isAsExpression(init)) init = init.expression;
      if (init && ts.isArrayLiteralExpression(init)) {
        const values = init.elements.map((el) =>
          ts.isStringLiteral(el) ? el.text : null,
        );
        if (values.every((v) => v !== null)) consts.set(node.name.text, values);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return consts;
}

/**
 * The roleIds a decorator call names, resolving spreads of local constants.
 *
 * Returns null if any argument could not be resolved. Callers MUST treat that
 * as a hard failure rather than as an empty list: silently emitting [] for
 * `@Roles(...PROVIDER_ROLES)` would record "no role may call this" for a field
 * five roles can reach, and the coverage test would then happily pass against
 * a fiction.
 */
function roleArgs(dec, consts) {
  if (!dec || !ts.isCallExpression(dec.expression)) return [];
  const roles = [];
  for (const arg of dec.expression.arguments) {
    if (ts.isStringLiteral(arg)) {
      roles.push(arg.text);
      continue;
    }
    if (
      ts.isSpreadElement(arg) &&
      ts.isIdentifier(arg.expression) &&
      consts.has(arg.expression.text)
    ) {
      roles.push(...consts.get(arg.expression.text));
      continue;
    }
    if (ts.isIdentifier(arg) && consts.has(arg.text)) {
      roles.push(...consts.get(arg.text));
      continue;
    }
    return null;
  }
  return [...new Set(roles)];
}

/**
 * The GraphQL root field a @Query/@Mutation exposes. Nest defaults to the
 * method name, but most of ours override it with `{ name: 'foo' }` — and the
 * override is what the client actually sends, so it wins.
 */
function rootFieldName(dec, methodName) {
  if (!ts.isCallExpression(dec.expression)) return methodName;
  for (const arg of dec.expression.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        prop.name.getText() === "name" &&
        ts.isStringLiteral(prop.initializer)
      ) {
        return prop.initializer.text;
      }
    }
  }
  return methodName;
}

const fields = new Map(); // rootField -> { kind, roles, source }
const conflicts = [];
const unresolved = [];

for (const rel of files) {
  const abs = join(BE_ROOT, rel);
  const source = ts.createSourceFile(
    abs,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  for (const stmt of source.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    if (!findDecorator(stmt, "Resolver")) continue;

    const consts = collectRoleConstants(source);

    // A class-level @Roles applies to every method that doesn't declare its
    // own — Nest's reflector uses getAllAndOverride(handler, class).
    const classRoles = findDecorator(stmt, "Roles");
    const classRoleIds = classRoles ? roleArgs(classRoles, consts) : null;
    if (classRoles && classRoleIds === null) {
      unresolved.push(`${rel} class ${stmt.name?.getText()}`);
    }

    for (const member of stmt.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const query = findDecorator(member, "Query");
      const mutation = findDecorator(member, "Mutation");
      const dec = query ?? mutation;
      if (!dec) continue;

      const methodName = member.name.getText();
      const field = rootFieldName(dec, methodName);
      const own = findDecorator(member, "Roles");
      const roles = own ? roleArgs(own, consts) : classRoleIds;
      if (own && roles === null) unresolved.push(`${rel} ${methodName}`);
      // A @Public field skips the auth guard entirely; no roles are involved.
      const isPublic = Boolean(findDecorator(member, "Public"));

      const entry = {
        kind: query ? "query" : "mutation",
        // null means "any authenticated account" — no @Roles anywhere on the
        // path. That is NOT the same as public, and not the same as [].
        roles: isPublic ? null : roles,
        public: isPublic,
        source: `${relative(BE_ROOT, abs)}:${
          source.getLineAndCharacterOfPosition(member.getStart()).line + 1
        }`,
      };

      const existing = fields.get(field);
      if (existing) {
        const same =
          JSON.stringify(existing.roles) === JSON.stringify(entry.roles);
        if (!same) conflicts.push({ field, a: existing, b: entry });
        continue;
      }
      fields.set(field, entry);
    }
  }
}

if (unresolved.length) {
  console.error(
    "Could not resolve the roles named by these @Roles decorators — the map " +
      "would understate who may call them:",
  );
  for (const u of unresolved) console.error(`  ${u}`);
  process.exit(2);
}

if (conflicts.length) {
  // Two resolvers exposing one root field under different guards means the
  // SDL itself is ambiguous — worth failing on rather than picking one.
  for (const c of conflicts) {
    console.error(
      `Conflicting guards for "${c.field}": ${c.a.source} ${JSON.stringify(
        c.a.roles,
      )} vs ${c.b.source} ${JSON.stringify(c.b.roles)}`,
    );
  }
  process.exit(2);
}

const sorted = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b));

const body = sorted
  .map(([field, e]) => {
    const value = e.public
      ? "PUBLIC"
      : e.roles === null
        ? "ANY_AUTHENTICATED"
        : `[${e.roles.map((r) => JSON.stringify(r)).join(", ")}]`;
    return `  ${JSON.stringify(field)}: ${value}, // ${e.kind} — ${e.source}`;
  })
  .join("\n");

const mutationList = sorted
  .filter(([, e]) => e.kind === "mutation")
  .map(([field]) => `  ${JSON.stringify(field)},`)
  .join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/extract-backend-roles.mjs
// Source: LALABA_BE_DEV/src/**/*.resolver.ts (${files.length} resolvers, ${sorted.length} root fields)
//
// Every GraphQL root field the backend exposes, paired with the roleIds its
// @Roles guard admits. This is a snapshot of the security boundary, kept in
// the panel so capability-coverage.test.ts can assert the UI never offers
// more than the backend allows.

/** No auth guard at all — login, health, and similar. */
export const PUBLIC = null;
/** Guarded by auth but by no @Roles — any signed-in account may call it. */
export const ANY_AUTHENTICATED = "*" as const;

export type BackendRoles = readonly string[] | typeof ANY_AUTHENTICATED | typeof PUBLIC;

export const BACKEND_ROLES: Record<string, BackendRoles> = {
${body}
};

/**
 * Root fields that are mutations rather than queries.
 *
 * The distinction matters to capability-coverage.test.ts: a query runs the
 * moment a page mounts, so every role that can open the page must be allowed
 * to call it. A mutation only runs when someone clicks the control that fires
 * it, and those are gated individually with <Can>.
 */
export const BACKEND_MUTATIONS: ReadonlySet<string> = new Set([
${mutationList}
]);
`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== out) {
    console.error(
      "backend-roles.generated.ts is stale. Run: node scripts/extract-backend-roles.mjs",
    );
    process.exit(1);
  }
  console.log(`backend-roles.generated.ts is up to date (${sorted.length} fields).`);
  process.exit(0);
}

writeFileSync(OUT, out);
console.log(
  `Wrote ${relative(PANEL_ROOT, OUT)} — ${sorted.length} root fields from ${files.length} resolvers.`,
);
