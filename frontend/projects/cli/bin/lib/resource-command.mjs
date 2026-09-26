import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {manifestFor,planRegeneration,applyRegeneration} from './regenerate.mjs';
import {validateResourceSpec} from './resource-spec.mjs';
import {generateResource} from './generate-resource.mjs';
export function resourceCommand(args){
 const options={};for(let i=0;i<args.length;i++){
  const flag=args[i];if(['--dry-run','--regenerate'].includes(flag)){const key=flag==='--dry-run'?'dryRun':'regenerate';if(options[key])throw new Error(`Duplicate ${flag}.`);options[key]=true;continue;}
  if(!['--spec','--out'].includes(flag)||!args[i+1]||args[i+1].startsWith('--')||options[flag.slice(2)])throw new Error('Unknown, missing or duplicate option.');options[flag.slice(2)]=args[++i];
 }
 if(!options.spec||!options.out)throw new Error('Usage: bqatlas generate crud --spec resource.json --out module-directory [--dry-run] [--regenerate]');
 const spec=validateResourceSpec(JSON.parse(readFileSync(resolve(options.spec),'utf8')));
 const target=resolve(options.out);
 const files=generateResource(spec);
 if(options.regenerate){
  const plan=planRegeneration(target,spec,files,options.spec);
  if(options.dryRun){console.log(JSON.stringify({action:'regenerate',changes:plan.changes,manifest:plan.manifest},null,2));return;}
  applyRegeneration(plan);console.log(`Regenerated ${target}; custom rules and untracked files were preserved.`);return;
 }
 if(existsSync(target))throw new Error('Output already exists; use --regenerate with a valid manifest to update unchanged generated source.');
 const manifest=manifestFor(spec,files);
 const text=JSON.stringify(manifest,null,2)+'\n';if(options.dryRun){console.log(text);return;}
 files.set('bqatlas.generation.json',text);mkdirSync(target,{recursive:true});for(const [path,content] of files){const file=resolve(target,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content,{flag:'wx'});}
 console.log(`Generated ${files.size} files in ${target}. See README.md for module registration and migration steps.`);
}
