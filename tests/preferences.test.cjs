// Run: node --test tests/preferences.test.cjs (no database or browser needed).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, globals = {}, dependencies = {}) {
  const filename = path.join(__dirname, "..", relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => dependencies[name] ?? require(name), ...globals }, { filename });
  return module.exports;
}
function browser(saved = null) {
  const values = new Map(saved === null ? [] : [["restaurant-erp.preferences.v1", saved]]);
  const events = new Map();
  const classes = new Set();
  const root = { dataset: {}, style: {}, lang: "en", classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } };
  const window = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name, callback) => { if (events.get(name) === callback) events.delete(name); },
  };
  return { window, document: { documentElement: root }, values, events, root, classes };
}
test("each selectable theme has matching CSS tokens, with chart palettes for alternate themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
  for (const theme of ["dark", "blue", "emerald"]) {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`));
    assert.ok(block, `${theme} selector exists`);
    for (const token of ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "border", "input", "ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]) {
      assert.match(block[1], new RegExp(`--${token}:`), `${theme} defines ${token}`);
    }
  }
  assert.match(css, /:root\s*\{/); // The unthemed SSR fallback is amber.
});
const source = "src/lib/preferences.ts";
test("translation uses explicit English/Hinglish pairs with English fallback", () => {
  const { createTranslator } = load("src/lib/i18n.ts", {}, { "./preferences": {} });
  assert.equal(createTranslator("en")("Save", "Save karo"), "Save");
  assert.equal(createTranslator("hinglish")("Save", "Save karo"), "Save karo");
  assert.equal(createTranslator("hinglish")("Inventory"), "Inventory");
  assert.equal(createTranslator("hinglish")("Save", ""), "Save");
});
test("translation hook and header controls render English on the server despite saved values", () => {
  const environment = browser(JSON.stringify({ language: "hinglish", theme: "dark" }));
  const preferences = load(source, environment);
  preferences.subscribePreferences(() => {});
  const i18n = load("src/lib/i18n.ts", {}, { "./preferences": preferences });
  function Message() { const { language, t } = i18n.useTranslation(); return React.createElement("p", null, `${language}:${t("Save", "Save karo")}`); }
  assert.equal(renderToStaticMarkup(React.createElement(Message)), "<p>en:Save</p>");
  const { PreferencesControls } = load("src/components/preferences-controls.tsx", {}, { "@/lib/preferences": preferences, "@/lib/i18n": i18n });
  const html = renderToStaticMarkup(React.createElement(PreferencesControls));
  assert.match(html, /Language/);
  assert.match(html, /Theme/);
  assert.match(html, /value="en" selected=""/);
  assert.match(html, /value="amber" selected=""/);
  assert.match(html, /value="dark"/);
  assert.match(html, /value="blue"/);
  assert.match(html, /value="emerald"/);
});
test("hook consumers see shared language updates and controls write validated selections", () => {
  const environment = browser();
  const react = { ...React, useSyncExternalStore: (_subscribe, get) => get(), useCallback: callback => callback };
  const preferences = load(source, environment, { react });
  const stop = preferences.subscribePreferences(() => {});
  const i18n = load("src/lib/i18n.ts", {}, { "./preferences": preferences, react });
  const { PreferencesControls } = load("src/components/preferences-controls.tsx", {}, { "@/lib/preferences": preferences, "@/lib/i18n": i18n });
  const selects = [];
  function walk(element) {
    if (!element || typeof element !== "object") return;
    if (element.type === "select") selects.push(element);
    React.Children.forEach(element.props?.children, walk);
  }
  walk(PreferencesControls({}));
  assert.equal(selects.length, 2);
  selects[0].props.onChange({ target: { value: "hinglish" } });
  selects[1].props.onChange({ target: { value: "emerald" } });
  assert.equal(i18n.useTranslation().language, "hinglish");
  assert.equal(i18n.useTranslation().t("Save", "Save karo"), "Save karo");
  assert.equal(preferences.getPreferences().theme, "emerald");
  assert.equal(environment.root.dataset.language, "hinglish");
  stop();
});
test("saved preferences initialize after subscription, persist and synchronize tabs", () => {
  const environment = browser(JSON.stringify({ language: "hinglish", theme: "dark" }));
  const store = load(source, environment);
  assert.equal(store.getPreferences().language, "en");
  let notifications = 0;
  const unsubscribe = store.subscribePreferences(() => notifications++);
  assert.equal(store.getPreferences().language, "hinglish");
  assert.equal(environment.root.dataset.theme, "dark");
  assert.equal(environment.classes.has("dark"), true);
  assert.equal(environment.root.style.colorScheme, "dark");
  store.setPreferences({ theme: "blue" });
  assert.equal(JSON.parse(environment.values.get(store.PREFERENCES_STORAGE_KEY)).language, "hinglish");
  assert.equal(environment.root.dataset.theme, "blue");
  assert.equal(environment.classes.has("dark"), false);
  environment.values.set(store.PREFERENCES_STORAGE_KEY, JSON.stringify({ language: "en", theme: "emerald" }));
  environment.events.get("storage")({ key: store.PREFERENCES_STORAGE_KEY, storageArea: environment.window.localStorage });
  assert.equal(store.getPreferences().theme, "emerald");
  assert.equal(store.getPreferences().language, "en");
  environment.values.clear();
  environment.events.get("storage")({ key: null, storageArea: environment.window.localStorage });
  assert.equal(store.getPreferences().theme, "amber");
  assert.ok(notifications >= 3);
  unsubscribe();
  assert.equal(environment.events.size, 0);
});
test("malformed storage and invalid values cannot become preferences", () => {
  for (const saved of ["{bad", "null", "[]", JSON.stringify({ language: "fr", theme: "pink" })]) {
    const environment = browser(saved);
    const store = load(source, environment);
    const stop = store.subscribePreferences(() => {});
    assert.equal(store.getPreferences().theme, "amber");
    assert.equal(store.getPreferences().language, "en");
    store.setPreferences({ language: "fr", theme: "pink" });
    assert.equal(store.getPreferences().theme, "amber");
    stop();
  }
});
test("blocked storage keeps in-memory preferences usable", () => {
  const environment = browser();
  Object.defineProperty(environment.window, "localStorage", { get() { throw new Error("blocked"); } });
  const store = load(source, environment);
  const stop = store.subscribePreferences(() => {});
  store.setPreferences({ language: "hinglish", theme: "dark" });
  assert.equal(store.getPreferences().language, "hinglish");
  assert.equal(environment.root.dataset.theme, "dark");
  stop();
});
test("SSR snapshot defaults to English and amber without browser globals", () => {
  const preferences = load(source);
  assert.equal(preferences.getServerSnapshot().language, "en");
  assert.equal(preferences.getServerSnapshot().theme, "amber");
  assert.equal(preferences.getPreferences(), preferences.getPreferences());
});
