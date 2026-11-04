// Run the unchanged GAP-023 business scenarios against the exact GAP-024 QA target.
// Only four connection constants/guards are remapped in-memory. No production target.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGPORT,'5441');
assert.equal(process.env.PGDATABASE,'restaurant_erp_gap024_qa_20261104');
assert.equal(process.env.BASE_URL,'http://localhost:3124');
const filename=path.join(__dirname,'gap023.integration.cjs');
let source=fs.readFileSync(filename,'utf8');
for(const [from,to] of [
 ["const DATABASE = 'restaurant_erp_gap023_qa_20261103';","const DATABASE = 'restaurant_erp_gap024_qa_20261104';"],
 ["const BASE = 'http://localhost:3123';","const BASE = 'http://localhost:3124';"],
 ["assert.equal(process.env.PGPORT, '5440',","assert.equal(process.env.PGPORT, '5441',"],
 ['port: 5440, database: DATABASE','port: 5441, database: DATABASE'],
]){assert.equal(source.split(from).length,2,'Expected unique original guarded target: '+from);source=source.replace(from,to);}
console.log('GAP-024 compatibility acceptance: unchanged GAP-023 scenarios; exact loopback QA target remapped only.');
const child=new Module(filename,module);child.filename=filename;child.paths=module.paths;child._compile(source,filename);
