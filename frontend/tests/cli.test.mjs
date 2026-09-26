import {createHash} from 'node:crypto';
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync,existsSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../projects/cli/bin/bqatlas.mjs',import.meta.url));
test('scaffolding rejects unsafe identifiers and never overwrites output',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bqatlas-cli-'));try{
 const target=join(temp,'supplier');const args=[cli,'scaffold','master-data','--module','Purchasing','--entity','Supplier','--plural','Suppliers','--out',target];
 assert.equal(spawnSync(process.execPath,args).status,0);
 const file=join(target,'server/Modules/Purchasing/Suppliers.cs');const original=readFileSync(file,'utf8');assert.match(original,/class Supplier/);assert.match(original,/purchasing\.suppliers\.read/);
 assert.notEqual(spawnSync(process.execPath,args).status,0);assert.equal(readFileSync(file,'utf8'),original);
 const bad=args.map(x=>x==='Purchasing'?'../Escape':x===target?join(temp,'bad'):x);assert.notEqual(spawnSync(process.execPath,bad).status,0);assert.equal(existsSync(join(temp,'bad')),false);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('dry-run is deterministic and its manifest matches every generated source',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bqatlas-preview-'));try{
 const target=join(temp,'supplier');const args=[cli,'scaffold','master-data','--module','Purchasing','--entity','Supplier','--plural','Suppliers','--out',target];
 const preview=spawnSync(process.execPath,[...args,'--dry-run'],{encoding:'utf8'});assert.equal(preview.status,0,preview.stderr);assert.equal(existsSync(target),false);
 const second=spawnSync(process.execPath,[...args,'--dry-run'],{encoding:'utf8'});assert.equal(second.stdout,preview.stdout);
 assert.equal(spawnSync(process.execPath,args).status,0);
 const manifest=JSON.parse(readFileSync(join(target,'bqatlas.generation.json'),'utf8'));assert.deepEqual(manifest,JSON.parse(preview.stdout));
 assert.ok(manifest.files.some(file=>file.path.endsWith('ResourceTests.cs')));
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(join(target,file.path))).digest('hex'),file.sha256);
 const before=readFileSync(join(target,'bqatlas.generation.json'),'utf8');assert.notEqual(spawnSync(process.execPath,[...args,'--dry-run']).status,0);assert.equal(readFileSync(join(target,'bqatlas.generation.json'),'utf8'),before);
 }finally{rmSync(temp,{recursive:true,force:true});}
});

const product=JSON.parse(readFileSync(new URL('../../resource-specs/inventory/product.resource.json',import.meta.url),'utf8'));
test('resource generation has deterministic ownership hashes and refuses existing source',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bqatlas-resource-'));try{
 const spec=join(temp,'resource.json');writeFileSync(spec,JSON.stringify(product));const target=join(temp,'generated');const args=[cli,'generate','crud','--spec',spec,'--out',target];
 const preview=spawnSync(process.execPath,[...args,'--dry-run'],{encoding:'utf8'});assert.equal(preview.status,0,preview.stderr);assert.equal(existsSync(target),false);
 const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(readFileSync(join(target,'bqatlas.generation.json'),'utf8'));assert.deepEqual(manifest,JSON.parse(preview.stdout));
 assert.ok(manifest.files.some(file=>file.ownership==='user'&&file.path.endsWith('.Custom.cs')));
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(join(target,file.path))).digest('hex'),file.sha256);
 const custom=manifest.files.find(file=>file.ownership==='user').path;writeFileSync(join(target,custom),'user business rules');assert.notEqual(spawnSync(process.execPath,args).status,0);assert.equal(readFileSync(join(target,custom),'utf8'),'user business rules');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('invalid resource specifications fail before creating output',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bqatlas-invalid-spec-'));try{
 const mutations=[s=>{s.fields[0].name='modifiedAT';},s=>{s.fields[0].relationship={resource:'crm.customers'};},s=>{s.fields[7].default='99999999999999.99991';},s=>{s.fields[7].maximum='90071992547409.0001';s.fields[7].default='90071992547409.0002';},s=>{s.form.fields.pop();},s=>{s.module='../Bad';},s=>{s.fields[6].options=[' X '];},s=>{s.key.type='integer';}];
 mutations.forEach((mutate,index)=>{const spec=structuredClone(product);mutate(spec);const input=join(temp,'spec.json');writeFileSync(input,JSON.stringify(spec));const out=join(temp,String(index));assert.notEqual(spawnSync(process.execPath,[cli,'generate','crud','--spec',input,'--out',out]).status,0);assert.equal(existsSync(out),false);});
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('template tokens in chosen names are not recursively rewritten',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bqatlas-token-name-'));try{
 const spec=structuredClone(product);spec.module='CustomersArchive';spec.resource='customersarchive.products';const input=join(temp,'spec.json');writeFileSync(input,JSON.stringify(spec));
 const target=join(temp,'resource');const result=spawnSync(process.execPath,[cli,'generate','crud','--spec',input,'--out',target],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 assert.match(readFileSync(join(target,'server/Modules/CustomersArchive/CustomersArchiveModule.cs'),'utf8'),/namespace App\.Modules\.CustomersArchive;/);
 const master=join(temp,'master');const legacy=spawnSync(process.execPath,[cli,'scaffold','master-data','--module','CustomersArchive','--entity','CustomerRecord','--plural','CustomerRecords','--out',master],{encoding:'utf8'});assert.equal(legacy.status,0,legacy.stderr);
 assert.match(readFileSync(join(master,'server/Modules/CustomersArchive/CustomerRecords.cs'),'utf8'),/namespace App\.Modules\.CustomersArchive;/);
 assert.match(readFileSync(join(master,'server/Modules/CustomersArchive/CustomersArchiveModule.cs'),'utf8'),/class CustomersArchiveModule/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
