// node --test tests/auth.test.cjs — uses only installed TypeScript + Node.
const ts = require("typescript");
const fs = require("node:fs");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const test = require("node:test"); const assert = require("node:assert/strict");
const { hashPassword, verifyPassword, validPassword } = require("../src/lib/server/password.ts");
const { branchScope, assertDelegation, assertUserAdmin, assertOwner, assertModule, validateGrants, safeUser } = require("../src/lib/server/permissions.ts");
const { assertSameOrigin, phone } = require("../src/lib/server/http.ts");
test("ten-digit mobile login normalizes to the existing Indian account identifier", () => {
 assert.equal(phone("6392578428"), "+916392578428");
 assert.equal(phone(" 6392578428 "), "+916392578428");
 assert.equal(phone("+916392578428"), "+916392578428");
 for (const value of ["639257842", "63925784289", "63925a8428", "", null, 6392578428]) assert.throws(() => phone(value));
});
const owner = { id: "owner", name: "Owner", phoneE164: "+919999999999", role: "SUPER_ADMIN", branchId: null, moduleAccess: [], status: "Active" };
const manager = { ...owner, id: "manager", role: "BRANCH_MANAGER", branchId: "b1", moduleAccess: ["INVENTORY", "USER_ADMIN"] };
const staff = { ...manager, id: "staff", role: "CASHIER", moduleAccess: ["INVENTORY"] };
test("accountant and workforce grants stay branch scoped and delegable only within held permissions", () => {
 const grants = ["ACCOUNTS_EXPENSES", "PAYROLL", "ATTENDANCE", "LEAVE_APPROVAL", "LEAVE_SELF"];
 assert.deepEqual(validateGrants(grants), grants);
 const admin = { ...manager, moduleAccess: grants };
 const accountant = { ...staff, id: "accountant", role: "ACCOUNTANT", moduleAccess: grants };
 assertDelegation(admin, accountant);
 assert.equal(branchScope(accountant), "b1");
 assert.throws(() => branchScope(accountant, "b2"));
 assert.throws(() => assertUserAdmin(accountant));
 assert.throws(() => assertDelegation(manager, accountant));
});
test("password hashes use independent salts and verify exact password", async () => {
 const a = await hashPassword("a-valid-password-123"), b = await hashPassword("a-valid-password-123");
 assert.notEqual(a, b); assert.equal(await verifyPassword("a-valid-password-123", a), true); assert.equal(await verifyPassword("wrong", a), false);
});
test("password verifier fails closed for malformed/missing hashes", async () => { for (const hash of [null, "", "scrypt$x$y", "sha$bad$bad"]) assert.equal(await verifyPassword("a-valid-password-123", hash), false); });
test("password validation rejects short or oversized UTF8 input", async () => { assert.equal(validPassword("short"), false); assert.equal(validPassword("界".repeat(100)), false); assert.equal(validPassword("long-password-123"), true); await assert.rejects(() => hashPassword("short")); });
test("only owner is unscoped across branches", () => { assert.equal(branchScope(owner), null); assert.equal(branchScope(owner, "b2"), "b2"); assert.equal(branchScope(manager), "b1"); assert.throws(() => branchScope(manager, "b2")); assert.throws(() => branchScope({ ...staff, branchId: null })); });
test("ordinary module access never bypasses branch or admin boundaries", () => { assertModule(staff, "INVENTORY"); assert.throws(() => assertModule(staff, "REPORTS")); assert.throws(() => assertUserAdmin({ ...staff, moduleAccess: ["USER_ADMIN"] })); assert.throws(() => assertOwner(manager)); assertModule(owner, "REPORTS"); });
test("branch admins can delegate held grants to same-branch staff/admins", () => { assertDelegation(manager, staff); assertDelegation(manager, { ...staff, role: "BRANCH_MANAGER" }); });
test("branch admins cannot self-edit, cross branches, elevate HQ or delegate unheld grants", () => { for (const target of [manager, { ...staff, branchId: "b2" }, { ...staff, branchId: null }, { ...staff, role: "SUPER_ADMIN" }, { ...staff, role: "CENTRAL_STORE_MGR" }, { ...staff, moduleAccess: ["REPORTS"] }]) assert.throws(() => assertDelegation(manager, target)); });
test("owner may manage HQ and all-branch users", () => { assertDelegation(owner, { ...staff, branchId: "b2", role: "SUPER_ADMIN" }); });
test("grants are validated against closed module-key vocabulary and deduped", () => { assert.deepEqual(validateGrants(["INVENTORY", "INVENTORY"]), ["INVENTORY"]); for (const value of [null, ["FAKE"], [42], "INVENTORY"]) assert.throws(() => validateGrants(value)); });
test("safe DTO never exposes hashes, session versions or arbitrary fields", () => { const dto = safeUser({ ...staff, passwordHash: "secret", tokenVersion: "1", extra: "hidden" }); assert.equal("passwordHash" in dto, false); assert.equal("tokenVersion" in dto, false); assert.equal("extra" in dto, false); });
test("CSRF rejects absent, cross-site and wrong origins", () => {
 const old = process.env.APP_ORIGIN; delete process.env.APP_ORIGIN;
 try { const req = headers => new Request("http://localhost:3000/api/users", { method: "POST", headers });
 assert.doesNotThrow(() => assertSameOrigin(req({ origin: "http://localhost:3000" })));
 for (const headers of [{}, { origin: "http://evil.test" }, { origin: "null" }, { origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }]) assert.throws(() => assertSameOrigin(req(headers)));
 process.env.APP_ORIGIN = "https://erp.example.test"; assert.doesNotThrow(() => assertSameOrigin(req({ origin: "https://erp.example.test" }))); assert.throws(() => assertSameOrigin(req({ origin: "http://localhost:3000" })));
 } finally { if (old === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = old; }
});
