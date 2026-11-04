const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(name){const m={exports:{}};const f=`src/lib/server/${name}.ts`;assert.ok(fs.existsSync(f),'document policy must exist');vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}})`)(r=>r.startsWith('./')?load(r.slice(2)):require(r),m,m.exports);return m.exports;}
const policy=()=>load('pos-document-policy');
test('document numbering delegates business-calendar instead of introducing another timezone definition',()=>{const source=fs.readFileSync('src/lib/server/pos-document-policy.ts','utf8');assert.match(source,/businessDateParts/);assert.doesNotMatch(source,/Africa\/Dar_es_Salaam/);});
test('permanent numbering uses safe branch label, EAT year and untruncated global bigint sequence',()=>{const p=policy();assert.equal(p.documentNumber('PROFORMA','b/ 1',new Date('2026-12-31T22:00:00Z'),'19'),'PF-B-1-2027-00000019');assert.equal(p.documentNumber('FINAL','B1',new Date('2026-01-01Z'),'123456789'),'INV-B1-2026-123456789');assert.throws(()=>p.documentNumber('FINAL','B1',new Date(),'0'));});
