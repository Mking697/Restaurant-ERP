const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {GUIDE_MODULES}=require('../src/lib/guide-content.ts'),{GUIDE_EXAMPLES}=require('../src/lib/guide-examples.ts');
test('Purchase and Accounts guidance distinguishes expected vendor claims from received money in both languages',()=>{
 for(const language of ['en','hinglish']){
  const purchase=GUIDE_MODULES.find(m=>m.module==='PURCHASE_ORDER'),accounts=GUIDE_MODULES.find(m=>m.module==='ACCOUNTS_EXPENSES');
  const p=language==='en'?purchase:purchase.hinglish,a=language==='en'?accounts:accounts.hinglish;
  assert.match(p.what,/claim/i);assert.match(p.what,/expected|expected/i);assert.doesNotMatch(p.what,/receivables.*not created|receivables.*nahi bante/i);
  assert.match(a.what,/VENDOR_REFUNDS/);assert.match(a.what,/read.only|read-only/i);
  assert.match(GUIDE_EXAMPLES['/purchase'][language].steps.join(' '),/Vendor returns/);
  assert.match(GUIDE_EXAMPLES['/accounts'][language].result,/VENDOR_REFUNDS/);
 }
});
