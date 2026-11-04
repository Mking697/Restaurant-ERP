'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runnerPath = path.join(__dirname, 'gap025.integration.cjs');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');
const originalSetting = () => ({
  key: 'RESTAURANT_NAME', value: 'Existing restaurant',
  updated_at: new Date('2025-04-03T02:01:00.000Z'),
});

// Execute the unmodified runner, including its top-level catch/finally. Only
// PostgreSQL and HTTP are substituted; no real Pool or fetch is reachable.
async function runHarness({ initial = originalSetting(), failAt = 'fixtures', cleanupFailure = false } = {}) {
  let setting = initial && { ...initial };
  let ownerId, branchId, transactionSetting, ended = false;
  const queries = [], logs = [], errors = [], fetches = [];
  const failure = code => Object.assign(new Error(code), { code });
  async function query(sql, params = []) {
    queries.push({ sql, params: Array.from(params) });
    if (sql === 'begin') transactionSetting = setting && { ...setting };
    else if (sql === 'rollback') setting = transactionSetting && { ...transactionSetting };
    else if (sql === 'select current_database() db') return { rows: [{ db: 'restaurant_erp_gap025_qa_20261104' }] };
    else if (sql.startsWith('insert into branches(')) branchId ??= params[0];
    else if (sql.startsWith('insert into users(') && params[3] === 'SUPER_ADMIN') ownerId = params[0];
    else if (sql.startsWith('insert into raw_materials(') && failAt === 'fixtures') throw failure('FIXTURE_SETUP_FAILURE');
    else if (sql === "select * from settings where key='RESTAURANT_NAME'") {
      if (failAt === 'capture') throw failure('SETTING_CAPTURE_FAILURE');
      return { rows: setting ? [{ ...setting }] : [] };
    } else if (sql.startsWith('insert into settings(')) {
      if (failAt === 'mutation') throw failure('SETTING_MUTATION_FAILURE');
      setting = { key: 'RESTAURANT_NAME', value: 'Original QA seller', updated_at: new Date('2026-11-04T00:00:00.000Z') };
    } else if (sql.startsWith('update settings set value=$1')) {
      if (setting) setting = { ...setting, value: params[0], updated_at: params[1] };
    } else if (sql === "delete from settings where key='RESTAURANT_NAME'") setting = undefined;
    else if (sql.startsWith('create temporary table g25_cleanup_rows') && cleanupFailure) throw failure('CLEANUP_FAILURE');
    else if (sql.startsWith('select count(*)::int n from ')) return { rows: [{ n: 0 }] };
    else if (!/^(begin$|commit$|rollback$|set local lock_timeout=|create temporary table g25_cleanup_rows|insert into (branches|users|sessions|raw_materials|vendors|vendor_rates|inventory_stock|stock_batches|menu_items|bom_recipes|g25_cleanup_rows)\b|select k\.conrelid|select distinct n\.nspname)/.test(sql)) {
      throw new Error('Unexpected SQL boundary: ' + sql);
    }
    return { rows: [], rowCount: 0 };
  }
  class Pool {
    query = query;
    async connect() { return { query, release() {} }; }
    async end() { ended = true; }
  }
  const fakeProcess = {
    env: { PGHOST: '127.0.0.1', PGPORT: '5442', PGDATABASE: 'restaurant_erp_gap025_qa_20261104', BASE_URL: 'http://localhost:3125' },
    argv: ['node', runnerPath], exitCode: undefined,
  };
  const allowed = new Set(['node:assert/strict', 'node:crypto', 'node:fs', 'node:path']);
  await vm.runInNewContext(runnerSource, {
    require(name) {
      if (name === 'pg') return { Pool };
      assert.ok(allowed.has(name), 'Unexpected module boundary: ' + name);
      return require(name);
    },
    process: fakeProcess, AbortSignal,
    console: { log: line => logs.push(line), error: line => errors.push(line) },
    async fetch(url) {
      fetches.push(url);
      let data;
      if (url.endsWith('/api/auth/me')) data = { user: { id: ownerId } };
      else if (url.endsWith('/api/branches/' + branchId)) data = { branch: { id: branchId } };
      else throw failure('ACCEPTANCE_BOUNDARY_FAILURE');
      return { status: 200, async text() { return JSON.stringify(data); } };
    },
  }, { filename: runnerPath, timeout: 5000 });
  assert.equal(ended, true, 'runner closes its pool');
  return { setting, queries, logs, errors, fetches, exitCode: fakeProcess.exitCode };
}

const settingWrites = result => result.queries.filter(({ sql }) => /^(insert into settings|update settings|delete from settings)/.test(sql));

test('partial fixture setup before setting capture preserves the existing restaurant setting', async () => {
  const result = await runHarness();
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ['FAIL guards: FIXTURE_SETUP_FAILURE']);
  assert.ok(result.logs.includes('PASS scoped FK-aware fixture cleanup'), 'actual cleanup ran');
  assert.deepEqual(result.setting, originalSetting());
  assert.equal(settingWrites(result).length, 0, 'uncaptured setting is never written');
});

test('failed setting capture preserves the existing setting without treating it as absent', async () => {
  const result = await runHarness({ failAt: 'capture' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ['FAIL guards: SETTING_CAPTURE_FAILURE']);
  assert.ok(result.logs.includes('PASS scoped FK-aware fixture cleanup'));
  assert.deepEqual(result.setting, originalSetting());
  assert.equal(settingWrites(result).length, 0);
});

test('rejected setting mutation does not restore or delete an unmodified setting', async () => {
  for (const initial of [originalSetting(), null]) {
    const result = await runHarness({ initial, failAt: 'mutation' });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.errors, ['FAIL guards: SETTING_MUTATION_FAILURE']);
    assert.ok(result.logs.includes('PASS scoped FK-aware fixture cleanup'));
    assert.deepEqual(result.setting, initial);
    assert.equal(settingWrites(result).length, 1, 'only the rejected mutation is attempted');
    assert.ok(settingWrites(result)[0].sql.startsWith('insert into settings('));
  }
});

test('successful setting mutation restores the existing value and exact updated_at after acceptance failure', async () => {
  const result = await runHarness({ failAt: 'acceptance' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ['FAIL draft/proforma and replay: ACCEPTANCE_BOUNDARY_FAILURE']);
  assert.ok(result.fetches.some(url => url.endsWith('/api/pos/drafts')), 'seed completed and acceptance ran');
  assert.ok(result.logs.includes('PASS scoped FK-aware fixture cleanup'));
  assert.deepEqual(result.setting, originalSetting());
  assert.equal(settingWrites(result).length, 2);
  assert.ok(settingWrites(result)[0].sql.startsWith('insert into settings('));
  assert.ok(settingWrites(result)[1].sql.startsWith('update settings set value=$1,updated_at=$2'));
  assert.deepEqual(settingWrites(result)[1].params, [originalSetting().value, originalSetting().updated_at]);
});

test('successful setting mutation restores originally absent setting by removing only its fixture value', async () => {
  const result = await runHarness({ initial: null, failAt: 'acceptance' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ['FAIL draft/proforma and replay: ACCEPTANCE_BOUNDARY_FAILURE']);
  assert.ok(result.logs.includes('PASS scoped FK-aware fixture cleanup'));
  assert.equal(result.setting, undefined);
  assert.equal(settingWrites(result).length, 2);
  assert.ok(settingWrites(result)[0].sql.startsWith('insert into settings('));
  assert.equal(settingWrites(result)[1].sql, "delete from settings where key='RESTAURANT_NAME'");
});

test('cleanup failure remains secondary to the original fixture setup failure', async () => {
  const result = await runHarness({ cleanupFailure: true });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.errors, ['FAIL guards: FIXTURE_SETUP_FAILURE', 'FAIL cleanup CLEANUP_FAILURE']);
  assert.deepEqual(result.setting, originalSetting());
  assert.equal(settingWrites(result).length, 0);
  assert.ok(result.queries.some(({ sql }) => sql === 'rollback'), 'failed cleanup rolls back');
});
