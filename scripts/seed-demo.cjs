// One-time demo seed for client walkthrough — DIRECT SQL against Neon.
// Idempotent: skips rows whose id already exists. Safe to re-run.
// Run manually: PGHOST=... PGPASSWORD=... node scripts/seed-demo.cjs
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
  filename
);
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { hashPassword } = require('../src/lib/server/password.ts');

const pool = new Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : false,
});

const BRANCHES = [
  { code: 'B1', name: 'Connaught Place', address: 'CP Inner Circle, New Delhi', lat: '28.6315', lng: '77.2167' },
  { code: 'B2', name: 'Saket', address: 'Select Citywalk Rd, Saket', lat: '28.5245', lng: '77.2066' },
  { code: 'B3', name: 'Gurugram', address: 'MG Road, Gurugram', lat: '28.4595', lng: '77.0266' },
  { code: 'B4', name: 'Noida', address: 'Sector 18, Noida', lat: '28.5708', lng: '77.3261' },
  { code: 'B5', name: 'Dwarka', address: 'Sector 12, Dwarka', lat: '28.5921', lng: '77.0460' },
  { code: 'B6', name: 'Rohini', address: 'Sector 7, Rohini', lat: '28.7158', lng: '77.1186' },
];

// [name, unit, category, isHighValue] — global catalog, shared across branches.
const MATERIALS = [
  ['Paneer', 'kg', 'Dairy', true],
  ['Chicken (boneless)', 'kg', 'Meat', true],
  ['Basmati Rice', 'kg', 'Grains', false],
  ['Fresh Cream', 'ltr', 'Dairy', true],
  ['Cooking Oil', 'ltr', 'Essentials', false],
];

// Per-branch stock: [branchCode, materialName, qtyOnHand, min, max]
const STOCK = [
  ['B1', 'Paneer', 18, 15, 40],
  ['B1', 'Basmati Rice', 72, 40, 90],
  ['B2', 'Fresh Cream', 4, 10, 30], // low-stock demo
  ['B2', 'Cooking Oil', 28, 25, 35],
  ['B3', 'Chicken (boneless)', 9, 20, 60], // low-stock demo
  ['B3', 'Paneer', 22, 15, 40],
  ['B4', 'Basmati Rice', 85, 40, 90], // near-overstock demo
  ['B4', 'Chicken (boneless)', 41, 20, 60],
  ['B5', 'Cooking Oil', 32, 25, 35],
  ['B5', 'Fresh Cream', 14, 10, 30],
  ['B6', 'Paneer', 19, 15, 40],
  ['B6', 'Basmati Rice', 55, 40, 90],
];

// Demo staff — fixture accounts for the client walkthrough, NOT real personal
// logins. Password is random + never reused; printed once below so whoever
// runs this script can note it, then should be rotated/deleted pre-go-live.
const STAFF = [
  { name: 'Rahul Sharma', phone: '+919876500001', role: 'BRANCH_MANAGER', branch: 'B3', grants: ['DASHBOARD_OWNER', 'TASKS_RECURRING', 'TASKS_DELEGATION', 'INVENTORY', 'CHECKLISTS', 'MIS_PERFORMANCE'] },
  { name: 'Priya Nair', phone: '+919876500002', role: 'BRANCH_MANAGER', branch: 'B1', grants: ['DASHBOARD_OWNER', 'TASKS_RECURRING', 'TASKS_DELEGATION', 'PURCHASE_INDENT', 'PURCHASE_ORDER', 'INVENTORY'] },
  { name: 'Amit Kumar', phone: '+919876500003', role: 'CASHIER', branch: 'B1', grants: ['POS_CASHIER', 'CASH_DROP'] },
];

(async () => {
  const branchIdByCode = {};
  for (const b of BRANCHES) {
    const existing = await pool.query('select id from branches where code = $1', [b.code]);
    if (existing.rows.length) { branchIdByCode[b.code] = existing.rows[0].id; continue; }
    const id = randomUUID();
    await pool.query(
      'insert into branches (id, name, code, address, lat, lng, geofence_radius_m) values ($1,$2,$3,$4,$5,$6,50)',
      [id, b.name, b.code, b.address, b.lat, b.lng]
    );
    branchIdByCode[b.code] = id;
    console.log('branch created:', b.code, b.name);
  }

  const materialIdByName = {};
  for (const [name, unit, category, isHighValue] of MATERIALS) {
    const existing = await pool.query('select id from raw_materials where name = $1', [name]);
    if (existing.rows.length) { materialIdByName[name] = existing.rows[0].id; continue; }
    const id = randomUUID();
    await pool.query('insert into raw_materials (id, name, unit, category, is_high_value) values ($1,$2,$3,$4,$5)', [id, name, unit, category, isHighValue]);
    materialIdByName[name] = id;
    console.log('material created:', name);
  }

  for (const [branchCode, materialName, qty, min, max] of STOCK) {
    const branchId = branchIdByCode[branchCode];
    const rawMaterialId = materialIdByName[materialName];
    const existing = await pool.query('select id from inventory_stock where branch_id = $1 and raw_material_id = $2', [branchId, rawMaterialId]);
    if (existing.rows.length) continue;
    await pool.query(
      'insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand, min_stock_level, max_stock_level) values ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), branchId, rawMaterialId, String(qty), String(min), String(max)]
    );
    console.log('stock seeded:', branchCode, materialName, qty);
  }

  console.log('\n--- Demo staff accounts (fixture only — rotate/delete before go-live) ---');
  for (const s of STAFF) {
    const existing = await pool.query('select id from users where phone_e164 = $1', [s.phone]);
    if (existing.rows.length) { console.log(s.name, '(already exists, skipped)'); continue; }
    const password = require('node:crypto').randomBytes(9).toString('base64url');
    const hash = await hashPassword(password);
    await pool.query(
      'insert into users (id, name, phone_e164, role, branch_id, password_hash, module_access) values ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), s.name, s.phone, s.role, branchIdByCode[s.branch], hash, s.grants]
    );
    console.log(`${s.name} | ${s.phone} | ${s.role} | demo password: ${password}`);
  }

  await pool.end();
  console.log('\nSeed complete.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
