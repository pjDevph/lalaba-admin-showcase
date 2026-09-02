/**
 * Asserts that what the UI offers never exceeds what the backend allows.
 *
 * `capabilities.ts` says it out loud: it is an affordance layer, not a
 * security boundary, and "everything here must mirror a guard that already
 * exists server-side". Nothing enforced that. The /washers page drifted —
 * support was shown a directory whose only query is @Roles('admin'), the
 * fetch 403'd, and the table rendered "No home washers yet", which is a false
 * statement about the platform rather than an error. Two more roles are
 * planned (finance, ops_admin), and each one multiplies the chances of the
 * same mistake.
 *
 * So this test walks the real thing rather than a hand-written summary:
 *   sidebar entry -> its capability -> the page it links to
 *     -> every GraphQL root field that page can reach, through the graphql
 *        wrappers and any components it renders
 *       -> the roles the backend's @Roles guard admits for each of those
 *
 * If a role holds the capability that reveals a page, that role must be
 * allowed to call every QUERY the page fetches on load. Anything else is a
 * dead link or a lying empty state.
 *
 * Mutations are deliberately out of scope: they run when someone clicks the
 * control that fires them, and those controls are gated one at a time with
 * <Can>, which no static read of the file can see. Checking them here would
 * flag every correctly-gated admin action on a support-visible page. The gap
 * that leaves — a mutation on a page with no <Can> around its button — is the
 * unsettled-orders case, and it needs a different test than this one.
 *
 * MODULES. A page is no longer necessarily one unit of authorization. A
 * capability-gated block that fetches its own data — see lib/modules.ts — is
 * checked against ITS capability, and its queries are subtracted from its host
 * page's check. Nothing goes unchecked by that subtraction: the module's own
 * assertion covers the same fields, against the capability that actually gates
 * them. This is the prerequisite for the unified operational context, which is
 * one route composed of blocks with six different capabilities.
 *
 * The backend half comes from backend-roles.generated.ts — regenerate it with
 * `node scripts/extract-backend-roles.mjs` whenever a resolver's guard moves.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  ANY_AUTHENTICATED,
  BACKEND_MUTATIONS,
  BACKEND_ROLES,
} from "@/lib/backend-roles.generated";
import { CAPABILITIES, ROLE_CAPABILITIES, type Capability } from "@/lib/capabilities";
import { ALLOWED_ROLES } from "@/context/auth-context";
import { OPERATIONAL_MODULES } from "@/lib/modules";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES_ROOT = join(SRC, "app", "(protected)");

// ─── GraphQL documents ──────────────────────────────────────────────────────

/**
 * The root fields an operation selects.
 *
 * Reads the document rather than the `const { x } = await graphqlFetch(...)`
 * destructure, so an aliased or multi-root query is still reported in full.
 */
export function rootFieldsOf(doc: string): string[] {
  // The operation header can contain parens (variable definitions) but the
  // body always opens at the first brace outside them.
  let parens = 0;
  let start = -1;
  for (let i = 0; i < doc.length; i++) {
    const c = doc[i];
    if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (c === "{" && parens === 0) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const fields: string[] = [];
  let depth = 1;
  let i = start + 1;

  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < doc.length && depth > 0) {
    const c = doc[i];
    if (c === "#") {
      while (i < doc.length && doc[i] !== "\n") i++;
    } else if (c === '"') {
      i++;
      while (i < doc.length && doc[i] !== '"') i += doc[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "(") {
      let p = 1;
      i++;
      while (i < doc.length && p > 0) {
        if (doc[i] === "(") p++;
        else if (doc[i] === ")") p--;
        i++;
      }
    } else if (c === "{") {
      depth++;
      i++;
    } else if (c === "}") {
      depth--;
      i++;
    } else if (isIdentStart(c)) {
      let j = i;
      while (j < doc.length && isIdent(doc[j])) j++;
      let name = doc.slice(i, j);
      i = j;
      if (depth === 1) {
        // `alias: field` — the alias is ours, the field is the backend's.
        let k = i;
        while (k < doc.length && /\s/.test(doc[k])) k++;
        if (doc[k] === ":") {
          k++;
          while (k < doc.length && /\s/.test(doc[k])) k++;
          let m = k;
          while (m < doc.length && isIdent(doc[m])) m++;
          name = doc.slice(k, m);
          i = m;
        }
        // Fragment spreads and inline fragments are not root fields.
        if (name !== "on" && name !== "fragment") fields.push(name);
      }
    } else {
      i++;
    }
  }

  return [...new Set(fields)];
}

// ─── Module graph ───────────────────────────────────────────────────────────

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(SRC, spec.slice(2));
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

interface FileFacts {
  /** Module-level string/template constants — the GraphQL documents. */
  docs: Map<string, string>;
  /** Declared function/const-arrow name -> what it does. */
  fns: Map<string, { roots: Set<string>; calls: Set<string> }>;
  /** Root fields fetched outside any named function. */
  looseRoots: Set<string>;
  /** Local binding -> where it came from. */
  imports: Map<string, { file: string; name: string }>;
}

const factsCache = new Map<string, FileFacts>();

function analyze(file: string): FileFacts {
  const cached = factsCache.get(file);
  if (cached) return cached;

  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const facts: FileFacts = {
    docs: new Map(),
    fns: new Map(),
    looseRoots: new Set(),
    imports: new Map(),
  };
  factsCache.set(file, facts);

  // Pass 1: imports and GraphQL document constants.
  const collectTop = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(file, node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          facts.imports.set(el.name.text, {
            file: target,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
      if (target && node.importClause?.name) {
        facts.imports.set(node.importClause.name.text, { file: target, name: "default" });
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (init && (ts.isNoSubstitutionTemplateLiteral(init) || ts.isStringLiteral(init))) {
        facts.docs.set(node.name.text, init.text);
      } else if (init && ts.isTemplateExpression(init)) {
        // Interpolated documents: the literal spans are enough to see the
        // root fields, which are never the interpolated part.
        facts.docs.set(
          node.name.text,
          init.head.text + init.templateSpans.map((s) => s.literal.text).join(" "),
        );
      }
    }
    ts.forEachChild(node, collectTop);
  };
  collectTop(source);

  // Pass 2: attribute fetches and calls to the function that performs them.
  const describeFn = (name: string) => {
    let entry = facts.fns.get(name);
    if (!entry) {
      entry = { roots: new Set(), calls: new Set() };
      facts.fns.set(name, entry);
    }
    return entry;
  };

  const walkBody = (node: ts.Node, owner: { roots: Set<string>; calls: Set<string> } | null) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;

      if (calleeName === "graphqlFetch") {
        const arg = node.arguments[0];
        let doc: string | undefined;
        if (arg && ts.isIdentifier(arg)) doc = facts.docs.get(arg.text);
        else if (arg && ts.isNoSubstitutionTemplateLiteral(arg)) doc = arg.text;
        else if (arg && ts.isTemplateExpression(arg)) {
          doc = arg.head.text + arg.templateSpans.map((s) => s.literal.text).join(" ");
        }
        if (doc) {
          const target = owner ? owner.roots : facts.looseRoots;
          for (const f of rootFieldsOf(doc)) target.add(f);
        }
      } else if (calleeName && owner) {
        owner.calls.add(calleeName);
      }
    }

    // A nested function declaration gets its own bucket rather than
    // inheriting the enclosing one — a component that queries inside a child
    // component should be attributed to that child.
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const entry = describeFn(node.name.text);
      ts.forEachChild(node, (c) => walkBody(c, entry));
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      const entry = describeFn(node.name.text);
      ts.forEachChild(node.initializer, (c) => walkBody(c, entry));
      return;
    }

    ts.forEachChild(node, (c) => walkBody(c, owner));
  };

  ts.forEachChild(source, (c) => walkBody(c, null));
  return facts;
}

/** Root fields reachable from one exported symbol, following calls across files. */
function rootsOfSymbol(file: string, name: string, seen = new Set<string>()): Set<string> {
  const key = `${file}#${name}`;
  if (seen.has(key)) return new Set();
  seen.add(key);

  const facts = analyze(file);
  const out = new Set<string>();
  const fn = facts.fns.get(name);
  if (fn) {
    for (const r of fn.roots) out.add(r);
    for (const call of fn.calls) {
      if (facts.fns.has(call)) {
        for (const r of rootsOfSymbol(file, call, seen)) out.add(r);
      } else {
        const imported = facts.imports.get(call);
        if (imported) {
          for (const r of rootsOfSymbol(imported.file, imported.name, seen)) out.add(r);
        }
      }
    }
  }
  return out;
}

/**
 * Everything a file can fetch: its own queries plus those of every module it
 * imports. Components are followed wholesale — a page renders a component in
 * full, so whatever that component fetches on mount, the page fetches.
 */
function rootsOfFile(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return new Set();
  seen.add(file);

  const facts = analyze(file);
  const out = new Set<string>(facts.looseRoots);
  for (const [, fn] of facts.fns) for (const r of fn.roots) out.add(r);

  for (const [, target] of facts.imports) {
    if (target.file.includes(`${join("lib", "graphql")}`)) {
      for (const r of rootsOfSymbol(target.file, target.name, new Set())) out.add(r);
    } else {
      for (const r of rootsOfFile(target.file, seen)) out.add(r);
    }
  }
  return out;
}

// ─── The sidebar ────────────────────────────────────────────────────────────

interface SidebarEntry {
  title: string;
  url: string;
  capability: Capability | null;
}

function readSidebar(): SidebarEntry[] {
  const file = join(SRC, "components", "app-sidebar.tsx");
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const entries: SidebarEntry[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const read = (key: string) => {
        for (const p of node.properties) {
          if (
            ts.isPropertyAssignment(p) &&
            p.name.getText() === key &&
            ts.isStringLiteral(p.initializer)
          ) {
            return p.initializer.text;
          }
        }
        return undefined;
      };
      const url = read("url");
      const title = read("title");
      if (url?.startsWith("/") && title) {
        entries.push({
          title,
          url,
          capability: (read("capability") as Capability | undefined) ?? null,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return entries;
}

function pageFileFor(url: string): string | null {
  const file = join(PAGES_ROOT, url === "/" ? "" : url.slice(1), "page.tsx");
  return existsSync(file) ? file : null;
}

/** Roles that hold a capability today. */
function rolesHolding(capability: Capability | null): string[] {
  return Object.entries(ROLE_CAPABILITIES)
    .filter(([, caps]) => capability === null || caps.includes(capability))
    .map(([role]) => role);
}

function rolesAllowedBy(rootField: string): string[] | "unknown" | "any" {
  const roles = BACKEND_ROLES[rootField];
  if (roles === undefined) return "unknown";
  if (roles === null || roles === ANY_AUTHENTICATED) return "any";
  return [...roles];
}

/** Query roots a set of source files can reach, ignoring mutations. */
function queryRootsOf(relativePaths: string[]): string[] {
  const roots = new Set<string>();
  for (const rel of relativePaths) {
    const file = join(SRC, rel);
    if (!existsSync(file)) continue;
    for (const root of rootsOfFile(file)) roots.add(root);
  }
  return [...roots].filter(
    (f) => BACKEND_ROLES[f] !== undefined && !BACKEND_MUTATIONS.has(f),
  );
}

/**
 * Every query owned by a registered module, mapped to the module that owns it.
 *
 * Computed once: the page test subtracts these, and the module test asserts
 * them against the module's own capability.
 */
const MODULE_OWNED: Map<string, (typeof OPERATIONAL_MODULES)[number]> = (() => {
  const owned = new Map<string, (typeof OPERATIONAL_MODULES)[number]>();
  for (const mod of OPERATIONAL_MODULES) {
    for (const field of queryRootsOf(mod.sources)) {
      owned.set(field, mod);
    }
  }
  return owned;
})();

/** Violations of "every role holding `capability` may call every field". */
function guardViolations(
  capability: Capability | null,
  fields: string[],
  describe: (role: string, field: string, allowed: string[]) => string,
  excuse?: (role: string, field: string) => boolean,
): string[] {
  const violations: string[] = [];
  for (const role of rolesHolding(capability)) {
    for (const field of fields) {
      const allowed = rolesAllowedBy(field);
      if (allowed === "any" || allowed === "unknown") continue;
      if (allowed.includes(role)) continue;
      if (excuse?.(role, field)) continue;
      violations.push(describe(role, field, allowed));
    }
  }
  return violations;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("capability map", () => {
  it("grants only capabilities that exist", () => {
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      for (const cap of caps) {
        expect(CAPABILITIES, `${role} holds unknown capability ${cap}`).toContain(cap);
      }
    }
  });

  it("keeps support a strict subset of admin", () => {
    const admin = new Set<string>(ROLE_CAPABILITIES.admin);
    for (const cap of ROLE_CAPABILITIES.support) {
      expect(admin, `support holds ${cap} but admin does not`).toContain(cap);
    }
    expect(ROLE_CAPABILITIES.support.length).toBeLessThan(ROLE_CAPABILITIES.admin.length);
  });

  // These are the ones whose blast radius is the reason the map exists at
  // all: money, credentials, and anything customers see.
  it.each([
    "fee:manage",
    "promo:manage",
    "wallet:adjust",
    "account:impersonate",
    "account:force_logout",
    "broadcast:send",
    "maintenance:toggle",
    "admin_user:manage",
  ] as const)("never grants %s to support", (cap) => {
    expect(ROLE_CAPABILITIES.support).not.toContain(cap);
  });
});

describe("sidebar", () => {
  const entries = readSidebar();

  it("finds the real sidebar", () => {
    expect(entries.length).toBeGreaterThan(15);
  });

  it("links only to pages that exist", () => {
    for (const entry of entries) {
      expect(pageFileFor(entry.url), `${entry.title} -> ${entry.url}`).not.toBeNull();
    }
  });

  it("names only real capabilities", () => {
    for (const entry of entries) {
      if (entry.capability === null) continue;
      expect(CAPABILITIES, `${entry.title}`).toContain(entry.capability);
    }
  });
});

/**
 * Pages that reach an out-of-reach query on purpose, with the reason.
 *
 * Keep this short and keep it justified: every row is a place where reading
 * the source statically disagrees with what actually runs. A row that stops
 * matching a real violation fails the test below, so this list cannot rot
 * into a list of muted bugs.
 */
const ALLOWED_EXCEPTIONS: Array<{
  url: string;
  role: string;
  field: string;
  reason: string;
}> = [
  // Empty on purpose. The one entry this list ever carried — support firing
  // `bookingProviders` from the dashboard's washer tile — stopped being a
  // mismatch when that query widened to ('admin', 'support'). Add an entry
  // here only for a call site whose guard static analysis genuinely cannot
  // see, never to quiet a real disagreement between this panel and a backend
  // resolver.
];

describe("UI capabilities never exceed backend guards", () => {
  const entries = readSidebar();
  const excused = new Set<string>();

  it.each(entries.map((e) => [e.title, e] as const))(
    "%s only shows for roles the backend will serve",
    (_title, entry) => {
      const file = pageFileFor(entry.url);
      if (!file) return; // covered by the sidebar test above
      const roots = [...rootsOfFile(file)]
        .filter((f) => BACKEND_ROLES[f] !== undefined && !BACKEND_MUTATIONS.has(f))
        // A registered module answers for its own queries, against its own
        // capability, in the module test below. Subtracting them here is what
        // lets one route host blocks that are authorized differently from the
        // route — without it, a page would have to demand the union of every
        // module it composes.
        .filter((f) => !MODULE_OWNED.has(f));

      const violations: string[] = [];
      for (const role of rolesHolding(entry.capability)) {
        for (const field of roots) {
          const allowed = rolesAllowedBy(field);
          if (allowed === "any" || allowed === "unknown") continue;
          if (allowed.includes(role)) continue;

          const exception = ALLOWED_EXCEPTIONS.find(
            (e) => e.url === entry.url && e.role === role && e.field === field,
          );
          if (exception) {
            excused.add(`${exception.url}|${exception.role}|${exception.field}`);
            continue;
          }

          violations.push(
            `${role} can open ${entry.url} (capability: ${
              entry.capability ?? "none"
            }) but the backend restricts ${field} to [${allowed.join(", ")}]`,
          );
        }
      }

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  // Runs last: an exception that no longer describes anything real is either
  // a fixed bug or a moved query, and either way it should stop being carried.
  it("carries no stale exceptions", () => {
    const stale = ALLOWED_EXCEPTIONS.filter(
      (e) => !excused.has(`${e.url}|${e.role}|${e.field}`),
    ).map((e) => `${e.url} / ${e.role} / ${e.field}`);

    expect(
      stale,
      `These ALLOWED_EXCEPTIONS no longer match a real mismatch — delete them:\n${stale.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * The other half of the page test.
 *
 * A module's queries are subtracted from its host page above, so this is where
 * they are actually checked — against the capability that gates the module,
 * not the one that opens the route.
 */
describe("operational modules never exceed backend guards", () => {
  it("registers only real capabilities", () => {
    for (const mod of OPERATIONAL_MODULES) {
      expect(CAPABILITIES, `module ${mod.id}`).toContain(mod.capability);
    }
  });

  it("points at files that exist", () => {
    for (const mod of OPERATIONAL_MODULES) {
      for (const rel of [...mod.sources, ...mod.mountedIn]) {
        const file = join(SRC, rel);
        expect(existsSync(file) && statSync(file).isFile(), `${mod.id} -> ${rel}`).toBe(
          true,
        );
      }
    }
  });

  it.each(OPERATIONAL_MODULES.map((m) => [m.id, m] as const))(
    "%s is served to every role that holds its capability",
    (_id, mod) => {
      const fields = queryRootsOf(mod.sources);

      // A module that reaches no guarded query is either mis-registered or has
      // been refactored until it fetches nothing — either way the registry
      // entry is describing something that no longer exists.
      expect(
        fields.length,
        `${mod.id} reaches no guarded query — is the registry entry stale?`,
      ).toBeGreaterThan(0);

      const violations = guardViolations(
        mod.capability,
        fields,
        (role, field, allowed) =>
          `${role} holds ${mod.capability} (module ${mod.id}) but the backend ` +
          `restricts ${field} to [${allowed.join(", ")}]`,
      );

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  /**
   * The registry records a boundary; `<Can capability="…">` at the mount point
   * IS the boundary. If they disagree, the subtraction above silently excuses a
   * query that nothing actually gates — the one failure mode that would make
   * this whole mechanism worse than not having it.
   *
   * Checked by looking for the capability string in the mounting file. That is
   * a proxy, not a proof: it cannot tell a `<Can>` wrapping the module from one
   * wrapping something else in the same file. It does catch the realistic
   * mistake — registering a module and forgetting to gate it at all — and a
   * stronger version needs the mount point to be a declared component rather
   * than arbitrary JSX.
   */
  it.each(OPERATIONAL_MODULES.map((m) => [m.id, m] as const))(
    "%s is gated where it is mounted",
    (_id, mod) => {
      for (const rel of mod.mountedIn) {
        const source = readFileSync(join(SRC, rel), "utf8");
        expect(
          source.includes(`"${mod.capability}"`),
          `${rel} mounts ${mod.id} but never names ${mod.capability} — the ` +
            "registry claims a gate that is not there",
        ).toBe(true);
      }
    },
  );
});

/**
 * The shell itself.
 *
 * Everything above walks sidebar entries, so anything mounted in the protected
 * LAYOUT — outside any route — was never checked at all. The omnibox is the
 * first thing to live there: it has no sidebar entry by design, because search
 * is not a place you go.
 *
 * It carries no capability either, and that is correct — every back-office
 * account can search. The rule it must satisfy is therefore stricter than a
 * page's: whatever the shell fetches has to be servable to EVERY role allowed
 * into the panel, since there is no gate to hide behind and no page to fail
 * on. A shell query that 403s for one role breaks that role's every screen.
 */
describe("the protected shell", () => {
  const layout = join(PAGES_ROOT, "layout.tsx");

  it("has a layout to check", () => {
    expect(existsSync(layout)).toBe(true);
  });

  it("fetches nothing that any panel role would be refused", () => {
    const roots = [...rootsOfFile(layout)]
      .filter((f) => BACKEND_ROLES[f] !== undefined && !BACKEND_MUTATIONS.has(f))
      // The MFA enrolment screen is reachable from here, but it is Firebase
      // client SDK calls rather than GraphQL, so nothing of its own appears.
      .filter((f) => !MODULE_OWNED.has(f));

    const violations: string[] = [];
    for (const role of ALLOWED_ROLES) {
      for (const field of roots) {
        const allowed = rolesAllowedBy(field);
        if (allowed === "any" || allowed === "unknown") continue;
        if (allowed.includes(role)) continue;
        violations.push(
          `the shell fetches ${field}, which the backend restricts to ` +
            `[${allowed.join(", ")}], but ${role} can reach the panel`,
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
