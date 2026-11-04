// Run unchanged GAP023/024 acceptance on the exact GAP025 compiled QA target.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,'5442');assert.equal(process.env.PGDATABASE,'restaurant_erp_gap025_qa_20261104');assert.equal(process.env.BASE_URL,'http://localhost:3125');
const gap=process.argv[2];assert.ok(['023','024'].includes(gap));assert.equal(process.argv.length,3);
const file=path.join(__dirname,'gap'+gap+'.integration.cjs'),oldPort=gap==='023'?'5440':'5441',oldApp=gap==='023'?'3123':'3124',oldDB=gap==='023'?'restaurant_erp_gap023_qa_20261103':'restaurant_erp_gap024_qa_20261104';
const source=fs.readFileSync(file,'utf8').replaceAll(oldDB,process.env.PGDATABASE).replaceAll('http://localhost:'+oldApp,process.env.BASE_URL).replaceAll(oldPort,'5442');
process.argv=process.argv.slice(0,2);const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(source,file);
