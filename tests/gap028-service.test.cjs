const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const menuImages = require('../src/lib/server/menu-images.ts');

test('processMenuImage validates and normalizes to a bounded JPEG thumbnail', async () => {
  const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#fff' } }).png().toBuffer();
  const out = await menuImages.processMenuImage(png);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(meta.width <= 640 && meta.height <= 640);

  const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#0f0' } }).jpeg().toBuffer();
  const outJpeg = await menuImages.processMenuImage(jpeg);
  assert.equal((await sharp(outJpeg).metadata()).format, 'jpeg');

  const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00f' } }).webp().toBuffer();
  const outWebp = await menuImages.processMenuImage(webp);
  assert.equal((await sharp(outWebp).metadata()).format, 'jpeg');
});

test('rejects empty, oversized, non-image, animated-PNG and mismatched-signature bytes', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
  const huge = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#fff' } }).png().toBuffer();
  const animated = Buffer.concat([png.subarray(0, 33), Buffer.from([0, 0, 0, 8]), Buffer.from('acTL'), Buffer.alloc(12), png.subarray(33)]);
  const oversized = Buffer.alloc(9 * 1024 * 1024);
  for (const bad of [Buffer.alloc(0), Buffer.from('not an image'), animated, oversized, huge, png.subarray(0, 40)]) {
    await assert.rejects(() => menuImages.processMenuImage(bad));
  }
});

test('menuImagePathname is branch/item-scoped, jpg-extensioned and unique per call', () => {
  const a = menuImages.menuImagePathname('branch-1', 'item-1');
  const b = menuImages.menuImagePathname('branch-1', 'item-1');
  assert.notEqual(a, b);
  assert.match(a, /^menu-images\/branch-1\/item-1\//);
  assert.match(a, /\.jpg$/);
});
