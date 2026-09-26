import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {validateResourceSpec} from './resource-spec.mjs';
import {generateResource} from './generate-resource.mjs';
export const generationManifest='bqatlas.generation.json';
const transactionDirectory='.bqatlas-regeneration';
export const hash=content=>createHash('sha256').update(content).digest('hex');
export const ownership=path=>path.endsWith('.Custom.cs')?'user':'generated';
export function manifestFor(spec,files){return {schemaVersion:1,generator:'@bqatlas/cli',version:'0.1.0-alpha.1',kind:'resource',inputs:spec,files:[...files].map(([path,content])=>({path,ownership:ownership(path),sha256:hash(content)})).sort((a,b)=>a.path.localeCompare(b.path))};}
function pathParts(path){if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[A-Za-z0-9._/-]+$/.test(path))throw new Error('Unsafe generation manifest path.');return path.split('/');}
function status(path,io=fs){try{return io.lstatSync(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
/** Never follow a link in any managed output path. Unknown files are not traversed. */
function inspect(target,path,io=fs){
 const parts=pathParts(path);let current=target;
 const root=status(target,io);if(!root?.isDirectory()||root.isSymbolicLink())throw new Error('Output must be an existing real directory.');
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);const stat=status(current,io);if(!stat)return null;
  if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isFile()))throw new Error(`Managed path is not a regular file: ${path}`);
  if(i===parts.length-1)return {content:io.readFileSync(current),mode:stat.mode & 0o777};
 }
}
export function planRegeneration(target,spec,files,specPath){
 target=resolve(target);
 if(status(join(target,transactionDirectory)))throw new Error(`An existing ${transactionDirectory} directory marks a running or interrupted regeneration. Resolve it before retrying.`);
 const original=inspect(target,generationManifest);if(!original)throw new Error('A resource generation manifest is required for regeneration.');
 const previous=JSON.parse(original.content.toString('utf8'));
 if(previous.schemaVersion!==1||previous.generator!=='@bqatlas/cli'||previous.kind!=='resource'||previous.version!=='0.1.0-alpha.1'||!Array.isArray(previous.files))throw new Error('Unsupported resource generation manifest.');
 const oldSpec=validateResourceSpec(previous.inputs);
 for(const key of ['module','entity','plural','resource'])if(oldSpec[key]!==spec[key])throw new Error(`Regeneration cannot rename ${key}; generate a new module and migrate business rules explicitly.`);
 const expected=generateResource(oldSpec),tracked=new Map(),snapshots=new Map([[generationManifest,original]]);
 for(const entry of previous.files){
  pathParts(entry.path);
  if(!expected.has(entry.path)||tracked.has(entry.path)||entry.ownership!==ownership(entry.path)||!/^[a-f0-9]{64}$/.test(entry.sha256??''))throw new Error('Invalid generation manifest file entry.');
  const existing=inspect(target,entry.path);if(!existing)throw new Error(`Tracked file is missing: ${entry.path}`);
  const isSpecInput=entry.path==='resource.json'&&resolve(specPath)===join(target,'resource.json');
  if(entry.ownership==='generated'&&!isSpecInput&&hash(existing.content)!==entry.sha256)throw new Error(`Generated file was edited: ${entry.path}. Move custom changes to an extension before regeneration.`);
  snapshots.set(entry.path,existing);tracked.set(entry.path,entry);
 }
 const next=new Map(files),changes=[];
 for(const [path,entry] of tracked){
  if(entry.ownership==='user'){
   next.set(path,snapshots.get(path).content);
   changes.push({path,action:'preserve',ownership:'user'});
  }else if(!next.has(path))changes.push({path,action:'remove',ownership:'generated'});
 }
 for(const [path,content] of next){
  if(tracked.get(path)?.ownership==='user')continue;
  const existing=snapshots.get(path)??inspect(target,path);
  if(existing&&!tracked.has(path))throw new Error(`Untracked file would be overwritten: ${path}`);
  snapshots.set(path,existing);
  changes.push({path,action:existing?(hash(content)===hash(existing.content)?'unchanged':'update'):'create',ownership:ownership(path)});
 }
 const manifest=manifestFor(spec,next);const manifestText=JSON.stringify(manifest,null,2)+'\n';
 next.set(generationManifest,manifestText);
 changes.push({path:generationManifest,action:hash(manifestText)===hash(original.content)?'unchanged':'update',ownership:'generated'});
 changes.sort((a,b)=>a.path.localeCompare(b.path));
 return {target,files:next,snapshots,changes,manifest};
}
function unchanged(plan,path,io){const actual=inspect(plan.target,path,io),expected=plan.snapshots.get(path);if(Boolean(actual)!==Boolean(expected)||(actual&&(hash(actual.content)!==hash(expected.content)||actual.mode!==expected.mode)))throw new Error(`File changed during regeneration: ${path}`);}
/** Stage first, keep rollback copies, and commit the manifest last. The lock is advisory. */
export function applyRegeneration(plan,io=fs){
 const operations=plan.changes.filter(change=>['create','update','remove'].includes(change.action)).sort((a,b)=>a.path===generationManifest?1:b.path===generationManifest?-1:a.path.localeCompare(b.path));
 if(!operations.length)return;
 const lock=join(plan.target,transactionDirectory);
 io.mkdirSync(lock,{mode:0o700});
 const journal={version:1,target:plan.target,operations:operations.map((operation,index)=>({...operation,backup:`backup-${index}`,staged:`staged-${index}`,oldHash:plan.snapshots.get(operation.path)?hash(plan.snapshots.get(operation.path).content):null,newHash:plan.files.has(operation.path)?hash(plan.files.get(operation.path)):null})),phase:'staging'};
 const applied=[];const createdDirectories=[];
 const saveJournal=()=>io.writeFileSync(join(lock,'journal.json'),JSON.stringify(journal,null,2)+'\n',{mode:0o600});
 try{
  saveJournal();
  for(const operation of journal.operations)if(operation.action!=='remove')io.writeFileSync(join(lock,operation.staged),plan.files.get(operation.path),{flag:'wx',mode:plan.snapshots.get(operation.path)?.mode??0o644});
  for(const path of plan.snapshots.keys())unchanged(plan,path,io);
  journal.phase='committing';saveJournal();
  for(const operation of journal.operations){
   unchanged(plan,operation.path,io);
   const file=join(plan.target,operation.path),backup=join(lock,operation.backup),entry={...operation,moved:false,installed:false};applied.push(entry);
   // Create only missing parents and remember them for ordinary-error rollback.
   const missing=[];for(let dir=dirname(file);dir!==plan.target&&!status(dir,io);dir=dirname(dir))missing.unshift(dir);
   for(const dir of missing){io.mkdirSync(dir);createdDirectories.push(dir);}
   if(operation.oldHash){io.renameSync(file,backup);entry.moved=true;
    if(hash(io.readFileSync(backup))!==operation.oldHash)throw new Error(`Concurrent edit detected in ${operation.path}; rolling back.`);
   }
   if(operation.action!=='remove'){io.renameSync(join(lock,operation.staged),file);entry.installed=true;}
  }
  journal.phase='committed';saveJournal();
 }catch(error){
  let recovered=true;
  for(const entry of [...applied].reverse()){
   const file=join(plan.target,entry.path),backup=join(lock,entry.backup);
   if(!entry.moved&&!entry.installed)continue;
   try{
    if(entry.installed){const actual=inspect(plan.target,entry.path,io);if(!actual||hash(actual.content)!==entry.newHash)throw new Error('Output changed after installation.');io.unlinkSync(file);}
    else if(status(file,io))throw new Error('Output path was recreated during rollback.');
    if(entry.moved)io.renameSync(backup,file);
   }catch{recovered=false;}
  }
  for(const dir of createdDirectories.reverse())try{io.rmdirSync(dir);}catch{}
  if(recovered){io.rmSync(lock,{recursive:true});throw error;}
  throw new Error(`Regeneration failed and concurrent changes prevented full rollback. Keep ${lock} for manual recovery; it contains original files and journal.json. Cause: ${error.message}`);
 }
 io.rmSync(lock,{recursive:true});
}
