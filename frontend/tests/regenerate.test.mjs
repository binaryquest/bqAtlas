import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateResource} from '../projects/cli/bin/lib/generate-resource.mjs';
import {planRegeneration,applyRegeneration} from '../projects/cli/bin/lib/regenerate.mjs';
const cli=fileURLToPath(new URL('../projects/cli/bin/bqatlas.mjs',import.meta.url));
const product=JSON.parse(fs.readFileSync(new URL('../../resource-specs/inventory/product.resource.json',import.meta.url),'utf8'));
function fixture(){
 const root=fs.mkdtempSync(join(tmpdir(),'bqatlas-regenerate-')),target=join(root,'module'),specPath=join(root,'input.json');
 const write=spec=>fs.writeFileSync(specPath,JSON.stringify(spec));write(product);
 const args=[cli,'generate','crud','--spec',specPath,'--out',target];
 const run=(flags=[])=>spawnSync(process.execPath,[...args,...flags],{encoding:'utf8'});
 const initial=run();assert.equal(initial.status,0,initial.stderr);
 const next=structuredClone(product);next.fields.push({name:'weight',label:'Weight',type:'decimal',required:true,scale:3,maximum:'100000',default:'0'});next.form.fields.push('weight');next.list.fields.push('weight');
 return {root,target,specPath,next,write,run,dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function snapshot(root){const result={};for(const name of fs.readdirSync(root,{recursive:true}).sort()){const file=join(root,name);if(fs.lstatSync(file).isFile())result[name]=fs.readFileSync(file).toString('base64');}return result;}
test('regeneration preview is deterministic, preserves custom/untracked files, and applies schema changes',()=>{
 const f=fixture();try{
 const custom='server/Modules/Inventory/ProductRules.Custom.cs';fs.appendFileSync(join(f.target,custom),'\n// Application rule retained.\n');fs.writeFileSync(join(f.target,'application-notes.txt'),'User notes');f.write(f.next);
 const before=snapshot(f.target),preview=f.run(['--regenerate','--dry-run']);assert.equal(preview.status,0,preview.stderr);assert.deepEqual(snapshot(f.target),before);
 assert.equal(f.run(['--regenerate','--dry-run']).stdout,preview.stdout);
 const plan=JSON.parse(preview.stdout);assert.ok(plan.changes.some(c=>c.path===custom&&c.action==='preserve'));assert.ok(plan.changes.some(c=>c.path==='client/feature.ts'&&c.action==='update'));
 const result=f.run(['--regenerate']);assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(join(f.target,custom)).toString('base64'),before[custom]);assert.equal(fs.readFileSync(join(f.target,'application-notes.txt'),'utf8'),'User notes');assert.match(fs.readFileSync(join(f.target,'client/feature.ts'),'utf8'),/weight: string/);
 assert.deepEqual(JSON.parse(fs.readFileSync(join(f.target,'bqatlas.generation.json'),'utf8')),plan.manifest);
 const unchanged=snapshot(f.target);assert.equal(f.run(['--regenerate']).status,0);assert.deepEqual(snapshot(f.target),unchanged);assert.equal(fs.existsSync(join(f.target,'.bqatlas-regeneration')),false);
 }finally{f.dispose();}
});
test('edited generated source and identity renames are rejected before writes',()=>{
 const f=fixture();try{
 const path=join(f.target,'client/feature.ts');fs.appendFileSync(path,'\n// Custom edit\n');f.write(f.next);const before=snapshot(f.target);
 const result=f.run(['--regenerate']);assert.notEqual(result.status,0);assert.match(result.stderr,/Generated file was edited/);assert.deepEqual(snapshot(f.target),before);
 f.next.entity='NewProduct';f.write(f.next);assert.match(f.run(['--regenerate']).stderr,/cannot rename entity/);assert.deepEqual(snapshot(f.target),before);
 }finally{f.dispose();}
});
test('an explicitly selected in-output specification can be edited and regenerated',()=>{
 const f=fixture();try{
 const input=join(f.target,'resource.json');fs.writeFileSync(input,JSON.stringify(f.next));const result=spawnSync(process.execPath,[cli,'generate','crud','--spec',input,'--out',f.target,'--regenerate'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(fs.readFileSync(join(f.target,'client/feature.ts'),'utf8'),/weight: string/);
 }finally{f.dispose();}
});
test('manifest traversal and managed symlinks cannot write outside the generated directory',()=>{
 const f=fixture();try{
 const outside=join(f.root,'outside.txt');fs.writeFileSync(outside,'Untouched');const manifestPath=join(f.target,'bqatlas.generation.json'),original=fs.readFileSync(manifestPath,'utf8'),manifest=JSON.parse(original);manifest.files[0].path='../outside.txt';fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 assert.match(f.run(['--regenerate']).stderr,/Unsafe generation manifest path/);assert.equal(fs.readFileSync(outside,'utf8'),'Untouched');fs.writeFileSync(manifestPath,original);
 const feature=join(f.target,'client/feature.ts');fs.unlinkSync(feature);fs.symlinkSync(outside,feature);assert.match(f.run(['--regenerate']).stderr,/not a regular file/);assert.equal(fs.readFileSync(outside,'utf8'),'Untouched');
 }finally{f.dispose();}
});
test('a write failure rolls back all replaced files and removes the transaction directory',()=>{
 const f=fixture();try{
 const before=snapshot(f.target),plan=planRegeneration(f.target,f.next,generateResource(f.next),f.specPath);let installed=0;
 const io={...fs,renameSync:(from,to)=>{if(basename(from).startsWith('staged-')&&++installed===2)throw new Error('Simulated disk failure');fs.renameSync(from,to);}};
 assert.throws(()=>applyRegeneration(plan,io),/Simulated disk failure/);assert.deepEqual(snapshot(f.target),before);assert.equal(fs.existsSync(join(f.target,'.bqatlas-regeneration')),false);
 }finally{f.dispose();}
});
test('changes after preview are detected without replacing the newer source',()=>{
 const f=fixture();try{
 const plan=planRegeneration(f.target,f.next,generateResource(f.next),f.specPath);const file=join(f.target,'client/feature.ts');fs.appendFileSync(file,'\n// Changed after preview\n');const before=snapshot(f.target);
 assert.throws(()=>applyRegeneration(plan),/File changed during regeneration/);assert.deepEqual(snapshot(f.target),before);assert.equal(fs.existsSync(join(f.target,'.bqatlas-regeneration')),false);
 }finally{f.dispose();}
});
test('interrupted rollback retains original files and journal and refuses another regeneration',()=>{
 const f=fixture();try{
 const plan=planRegeneration(f.target,f.next,generateResource(f.next),f.specPath);let installed=0;
 const io={...fs,renameSync:(from,to)=>{if(basename(from).startsWith('staged-')&&++installed===2)throw new Error('Simulated disk failure');if(basename(from).startsWith('backup-'))throw new Error('Simulated restore failure');fs.renameSync(from,to);}};
 assert.throws(()=>applyRegeneration(plan,io),/manual recovery/);const lock=join(f.target,'.bqatlas-regeneration');assert.ok(fs.existsSync(join(lock,'journal.json')));assert.ok(fs.readdirSync(lock).some(name=>name.startsWith('backup-')));assert.throws(()=>planRegeneration(f.target,f.next,generateResource(f.next),f.specPath),/running or interrupted/);
 }finally{f.dispose();}
});

test('untracked collisions and missing tracked files are rejected without collateral changes',()=>{
 const f=fixture();try{
 const manifestPath=join(f.target,'bqatlas.generation.json'),original=fs.readFileSync(manifestPath,'utf8'),manifest=JSON.parse(original);manifest.files=manifest.files.filter(file=>file.path!=='client/feature.test.mjs');fs.writeFileSync(manifestPath,JSON.stringify(manifest));const before=snapshot(f.target);
 assert.match(f.run(['--regenerate']).stderr,/Untracked file would be overwritten/);assert.deepEqual(snapshot(f.target),before);
 fs.writeFileSync(manifestPath,original);fs.unlinkSync(join(f.target,'client/feature.ts'));const missing=snapshot(f.target);assert.match(f.run(['--regenerate']).stderr,/Tracked file is missing/);assert.deepEqual(snapshot(f.target),missing);
 }finally{f.dispose();}
});
test('changing ownership in a manifest cannot authorize overwriting custom rules',()=>{
 const f=fixture();try{
 const manifestPath=join(f.target,'bqatlas.generation.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.files.find(file=>file.path.endsWith('.Custom.cs')).ownership='generated';fs.writeFileSync(manifestPath,JSON.stringify(manifest));const before=snapshot(f.target);
 assert.match(f.run(['--regenerate']).stderr,/Invalid generation manifest file entry/);assert.deepEqual(snapshot(f.target),before);
 }finally{f.dispose();}
});
test('obsolete generated files can be removed while obsolete custom files remain user-owned',()=>{
 const f=fixture();try{
 const files=generateResource(f.next),custom='server/Modules/Inventory/ProductRules.Custom.cs';files.delete('client/feature.test.mjs');files.delete(custom);
 fs.appendFileSync(join(f.target,custom),'\n// Preserve even if the next generator omits this hook.\n');const before=fs.readFileSync(join(f.target,custom),'utf8');
 const plan=planRegeneration(f.target,f.next,files,f.specPath);assert.ok(plan.changes.some(c=>c.path==='client/feature.test.mjs'&&c.action==='remove'));applyRegeneration(plan);
 assert.equal(fs.existsSync(join(f.target,'client/feature.test.mjs')),false);assert.equal(fs.readFileSync(join(f.target,custom),'utf8'),before);
 assert.ok(JSON.parse(fs.readFileSync(join(f.target,'bqatlas.generation.json'),'utf8')).files.some(file=>file.path===custom&&file.ownership==='user'));
 }finally{f.dispose();}
});
test('permission changes after preview cause refusal before installing new source',()=>{
 const f=fixture();try{
 const plan=planRegeneration(f.target,f.next,generateResource(f.next),f.specPath),file=join(f.target,'client/feature.ts');fs.chmodSync(file,0o600);const before=snapshot(f.target);
 assert.throws(()=>applyRegeneration(plan),/File changed during regeneration/);assert.deepEqual(snapshot(f.target),before);assert.equal(fs.statSync(file).mode & 0o777,0o600);
 }finally{f.dispose();}
});
