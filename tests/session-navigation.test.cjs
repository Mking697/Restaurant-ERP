const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToString } = require("react-dom/server");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const identity = { id: "qa-owner", name: "QA Owner", phoneE164: "+910000000000", role: "SUPER_ADMIN", branchId: null, moduleAccess: [], status: "Active" };
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
const link = ({ children, prefetch, ...props }) => React.createElement("a", { ...props, "data-next-link": "true" }, children);
const translation = { useTranslation: () => ({ language: "en", t: english => english }) };
function load(relative, overrides = {}, globals = {}) {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => name in overrides ? overrides[name] : require(name.startsWith(".") ? path.resolve(path.dirname(filename), name) : name), setTimeout, clearTimeout, AbortController, console, ...globals }, { filename });
  return module.exports;
}
function harness(fetch = async () => ({ ok: true, status: 200, json: async () => ({ user: identity }) })) {
  const timers = new Map(); const events = new Map(); let next = 0;
  const window = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), setInterval: fn => { timers.set(++next, fn); return next; }, clearInterval: id => timers.delete(id) };
  const store = load("src/lib/current-user.ts", {}, { fetch, window });
  return { store, timers, events };
}
test("verified identity renders during SSR without mutating the process-wide client store", () => {
  const { store } = harness();
  const { SessionBootstrap } = load("src/components/session-bootstrap.tsx", { "@/lib/current-user": store });
  function Probe() { const user = store.useCurrentUser(); return React.createElement("p", null, user.authenticated ? user.name : "Verifying session…"); }
  const html = renderToString(React.createElement(SessionBootstrap, { user: identity }, React.createElement(Probe)));
  assert.match(html, /QA Owner/); assert.doesNotMatch(html, /Verifying session/);
  assert.equal(store.getCurrentUser().authenticated, false, "SSR must not share one request's identity with another request");
  store.seedCurrentUser({ ...identity, id: "different-browser-user", name: "Wrong identity" });
  const anotherRequest = renderToString(React.createElement(SessionBootstrap, { user: { ...identity, name: "Second request" } }, React.createElement(Probe)));
  assert.match(anotherRequest, /Second request/); assert.doesNotMatch(anotherRequest, /Wrong identity/);
});
test("many consumers share one refresh timer/focus listener and seeded session needs no redundant fetch", async () => {
  let calls = 0;
  const { store, timers, events } = harness(async () => { calls++; return { ok: true, status: 200, json: async () => ({ user: identity }) }; });
  store.seedCurrentUser(identity);
  const stopA = store.startCurrentUserRefresh(); const stopB = store.startCurrentUserRefresh();
  assert.equal(calls, 0); assert.equal(timers.size, 1); assert.equal(events.size, 1);
  events.get("focus")(); events.get("focus")();
  await store.refreshCurrentUser(); assert.equal(calls, 1, "concurrent refreshes must coalesce");
  stopA(); assert.equal(timers.size, 1); stopB(); assert.equal(timers.size, 0); assert.equal(events.size, 0);
});
test("hung fetch and JSON decoding time out, retry is finite, and authorization fails closed", async () => {
  for (const hangAt of ["fetch", "json"]) {
    let calls = 0; const signals = []; const callbacks = new Map(); let next = 0;
    const store = load("src/lib/current-user.ts", {}, {
      fetch: async (_url, options) => { calls++; signals.push(options.signal); return hangAt === "fetch" ? new Promise(() => {}) : { ok: true, status: 200, json: () => new Promise(() => {}) }; },
      setTimeout: fn => { callbacks.set(++next, fn); return next; }, clearTimeout: id => callbacks.delete(id),
    });
    store.seedCurrentUser(identity);
    const pending = store.refreshCurrentUser();
    for (let attempt = 0; attempt < 2; attempt++) {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(callbacks.size, 1, "every attempt must have a finite deadline");
      const expire = [...callbacks.values()][0]; expire();
    }
    await pending;
    assert.equal(calls, 2); assert.ok(signals.every(signal => signal.aborted)); assert.equal(callbacks.size, 0);
    assert.equal(store.getCurrentUser().ready, true); assert.equal(store.getCurrentUser().authenticated, false); assert.match(store.getCurrentUser().error, /timed out/i);
  }
});
test("401 clears identity without retry; a late refresh cannot restore logged-out grants", async () => {
  let calls = 0;
  const { store } = harness(async () => { calls++; return { ok: false, status: 401, json: async () => ({}) }; });
  store.seedCurrentUser(identity); await store.refreshCurrentUser();
  assert.equal(calls, 1); assert.equal(store.getCurrentUser().authenticated, false);
  let resolve;
  const delayed = harness(() => new Promise(done => { resolve = done; })).store;
  delayed.seedCurrentUser(identity); const pending = delayed.refreshCurrentUser(); delayed.clearCurrentUser();
  resolve({ ok: true, status: 200, json: async () => ({ user: identity }) }); await pending;
  assert.equal(delayed.getCurrentUser().authenticated, false);
});
test("desktop, mobile and header navigation use Next links and expose the preferences toolbar", () => {
  const { store } = harness(); store.seedCurrentUser(identity);
  const icon = () => null;
  const { AppShell, canNavigate } = load("src/components/app-shell.tsx", {
    "next/link": { default: link, __esModule: true }, "next/navigation": { useRouter: () => ({}) },
    "lucide-react": new Proxy({}, { get: () => icon }), "@/lib/utils": { cn: (...args) => args.filter(Boolean).join(" ") },
    "@/lib/nav": load("src/lib/nav.ts"), "@/lib/current-user": store,
    "@/lib/current-branch": { useBranches: () => ({ branches: [], loading: false }), useSelectedBranchId: () => "all", setSelectedBranchId() {} },
    "@/components/ui/sheet": { Sheet: passthrough, SheetContent: passthrough, SheetCloseButton: () => null },
    "@/components/ui/button": { Button: ({ children }) => React.createElement("button", null, children) },
    "@/components/branding-provider": { RestaurantBrand: () => React.createElement("span", null, "QA Restaurant") },
    "@/components/preferences-controls": { PreferencesControls: () => React.createElement("div", { "data-preferences": "true" }) }, "@/lib/i18n": translation,
  });
  assert.equal(canNavigate(store.verifiedCurrentUser(identity), "/admin/settings/restaurant", "USER_ADMIN"), true);
  assert.equal(canNavigate(store.verifiedCurrentUser({...identity,role:"BRANCH_MANAGER",moduleAccess:["USER_ADMIN"]}), "/admin/settings/restaurant", "USER_ADMIN"), false);
  // SSR intentionally ignores the singleton; the verified request context is required.
  const html = renderToString(React.createElement(store.SessionIdentityContext.Provider, { value: store.verifiedCurrentUser(identity) }, React.createElement(AppShell, null, "Module body")));
  const anchors = html.match(/<a\b[^>]*>/g) || [];
  assert.ok(anchors.length > 10);
  for (const anchor of anchors) assert.match(anchor, /data-next-link="true"/);
  assert.match(html, /data-preferences="true"/); assert.match(html, /Module body/); assert.doesNotMatch(html, /Verifying session/);
});
test("root layout only bootstraps safe identity; it owns no route-dependent notice or authorization", async () => {
  const modules = load("src/lib/moduleAccess.ts");
  const permissions = load("src/lib/server/permissions.ts", { "../moduleAccess": modules });
  let current = { ...identity, passwordHash: "MUST_NOT_SERIALIZE", tokenVersion: "MUST_NOT_SERIALIZE", arbitrary: "MUST_NOT_SERIALIZE" };
  let props;
  const { default: RootLayout } = load("src/app/layout.tsx", {
    "next/headers": { headers: async () => new Map([["x-restaurant-path", "/dashboard"]]) },
    "next/navigation": { redirect: url => { throw new Error("REDIRECT:" + url); } },
    "@/lib/server/auth": { requireIdentity: async () => { if (!current) throw new permissions.HttpError(401, "No session"); return current; } },
    "@/lib/server/permissions": permissions,
    "@/components/session-bootstrap": { SessionBootstrap: value => { props = value; return React.createElement(passthrough, value); } },
    "@/components/branding-provider": { BrandingProvider: passthrough },
    "@/lib/server/branding": { readBranding: async () => ({name:"QA Restaurant",logoUrl:null}) },
    "./globals.css": {},
  });
  const html = renderToString(await RootLayout({ children: "Page-owned content" }));
  assert.match(html, /Page-owned content/);
  assert.equal(props.user.id, identity.id); assert.doesNotMatch(JSON.stringify(props.user), /MUST_NOT_SERIALIZE|passwordHash|tokenVersion|arbitrary/);
  const source = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  assert.doesNotMatch(source, /canOpenPath|isPersistedPath|DemoDataNotice|AccessDeniedNotice/);
  current = null;
  await assert.rejects(() => RootLayout({ children: "SECRET" }), /REDIRECT:\/login/);
});
function pageHarness() {
  const modules = load("src/lib/moduleAccess.ts");
  const permissions = load("src/lib/server/permissions.ts", { "../moduleAccess": modules });
  const access = load("src/lib/server/page-access.ts");
  const state = { user: { ...identity }, calls: 0, paths: [], props: null };
  const redirect = url => { throw new Error("REDIRECT:" + url); };
  const guard = load("src/components/protected-page.tsx", {
    "next/navigation": { redirect },
    "@/lib/server/auth": { requireIdentity: async () => { state.calls++; if (!state.user) throw new permissions.HttpError(401, "Revoked"); return state.user; } },
    "@/lib/server/permissions": permissions,
    "@/lib/server/page-access": { ...access, canOpenPath: (user, pathname) => { state.paths.push(pathname); return access.canOpenPath(user, pathname); } },
    "@/components/app-shell": { AppShell: passthrough },
    "@/components/session-bootstrap": { SessionBootstrap: props => { state.props = props; return React.createElement(passthrough, props); } },
    "@/components/session-notices": { AccessDeniedNotice: () => React.createElement("h1", null, "Access denied"), DemoDataNotice: () => React.createElement("p", null, "Demo data") },
  });
  return { state, guard, redirect };
}
const protectedRoutes = ["/", "/dashboard", "/reports", "/reports/[report]", "/performance", "/tasks", "/inventory", "/purchase", "/pos", "/cash-drop", "/accounts", "/admin/branches", "/admin/users", "/admin/settings/whatsapp", "/admin/settings/restaurant", "/guide"];
test("every protected page is a dynamic server wrapper using its own literal route and the live guard", async () => {
  const { state, guard, redirect } = pageHarness();
  for (const route of protectedRoutes) {
    const filename = "src/app" + (route === "/" ? "" : route) + "/page.tsx";
    const source = fs.readFileSync(path.join(root, filename), "utf8");
    assert.doesNotMatch(source, /["']use client["']/);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /protectedPage\(/);
    const Page = load(filename, {
      "@/components/protected-page": guard,
      "./page-content": { __esModule: true, default: () => React.createElement("p", null, "MODULE_SECRET") },
      "./report-content": { __esModule: true, default: () => React.createElement("p", null, "MODULE_SECRET") },
      "@/lib/server/branding": { readBranding: async () => ({name:"QA Restaurant",logoUrl:null}) },
      "@/lib/reports": { REPORT_DEFS: [{ slug: "qa-report" }] },
      "next/navigation": { redirect, notFound: () => { throw new Error("NOT_FOUND"); } },
    }).default;
    const before = state.calls;
    if (route === "/") await assert.rejects(() => Page(), /REDIRECT:\/dashboard/);
    else assert.match(renderToString(await Page({ params: Promise.resolve({ report: "qa-report" }) })), /MODULE_SECRET/);
    assert.equal(state.calls, before + 1, route + " must independently check live identity");
    assert.equal(state.paths.at(-1), route === "/reports/[report]" ? "/reports/qa-report" : route);
    state.user = null;
    await assert.rejects(() => Page({ params: Promise.resolve({ report: "qa-report" }) }), /REDIRECT:\/login/);
    state.user = { ...identity };
  }
});
test("page navigation without rerendering root updates demo notice, permissions and safe bootstrap", async () => {
  const { state, guard } = pageHarness();
  let rendered = 0;
  const content = () => { rendered++; return React.createElement("p", null, "MODULE_SECRET"); };
  // These are independent page/RSC renders while the root stays mounted.
  let html = renderToString(await guard.protectedPage("/dashboard", content));
  assert.match(html, /Demo data/); assert.match(html, /MODULE_SECRET/);
  for (const route of ["/guide", "/inventory", "/admin/users", "/admin/branches", "/admin/settings/whatsapp", "/admin/settings/restaurant"]) {
    html = renderToString(await guard.protectedPage(route, content));
    assert.doesNotMatch(html, /Demo data/); assert.match(html, /MODULE_SECRET/);
  }
  html = renderToString(await guard.protectedPage("/reports/sales", content));
  assert.match(html, /Demo data/);
  state.user = { ...identity, role: "CASHIER", branchId: "own-branch", moduleAccess: ["INVENTORY"], passwordHash: "MUST_NOT_SERIALIZE" };
  const before = rendered;
  for (const route of ["/dashboard", "/reports/sales", "/admin/users", "/admin/settings/whatsapp", "/admin/settings/restaurant"]) {
    html = renderToString(await guard.protectedPage(route, content));
    assert.match(html, /Access denied/); assert.doesNotMatch(html, /MODULE_SECRET|Demo data/);
  }
  assert.equal(rendered, before, "denied content callback must never execute");
  assert.doesNotMatch(JSON.stringify(state.props.user), /MUST_NOT_SERIALIZE|passwordHash/);
  assert.equal(state.props.user.branchId, "own-branch");
  html = renderToString(await guard.protectedPage("/inventory", content));
  assert.match(html, /MODULE_SECRET/); assert.doesNotMatch(html, /Access denied|Demo data/);
  state.user.moduleAccess = [];
  html = renderToString(await guard.protectedPage("/inventory", content));
  assert.doesNotMatch(html, /MODULE_SECRET/); assert.match(html, /Access denied/);
  state.user = null;
  await assert.rejects(() => guard.protectedPage("/guide", content), /REDIRECT:\/login/);
});
test("session notices default to English and support explicit Hinglish without document rewriting", () => {
  for (const language of ["en", "hinglish"]) {
    const copy = { useTranslation: () => ({ language, t: (english, hinglish) => language === "hinglish" && hinglish ? hinglish : english }) };
    const { AccessDeniedNotice, DemoDataNotice } = load("src/components/session-notices.tsx", { "next/link": { __esModule: true, default: link }, "@/lib/i18n": copy });
    const html = renderToString(React.createElement(React.Fragment, null, React.createElement(AccessDeniedNotice), React.createElement(DemoDataNotice)));
    assert.match(html, language === "en" ? /Access denied/ : /Access nahi hai/);
    assert.match(html, language === "en" ? /not live database records/ : /abhi real database se connected nahi/);
    assert.match(html, /data-next-link="true"/);
  }
});
