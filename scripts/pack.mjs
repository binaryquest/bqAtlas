import {spawnSync} from 'node:child_process';
import {copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,NG_BUILD_PARALLEL_TS:'0',NG_BUILD_MAX_WORKERS:'1'}});if(result.status!==0)process.exit(result.status??1);}
run('npm',['run','build:libs','--prefix','frontend']);
for(const [source,name] of [['samples/erp/server/Modules/Crm/Customers.cs','Customers.cs'],['samples/erp/server/Modules/Crm/CrmModule.cs','CrmModule.cs'],['samples/erp/server/Modules/Crm.Contracts/CustomerSummary.cs','CustomerSummary.cs']])copyFileSync(source,'frontend/projects/cli/templates/'+name);
mkdirSync('frontend/projects/cli/examples',{recursive:true});
copyFileSync('resource-specs/inventory/product.resource.json','frontend/projects/cli/examples/product.resource.json');
run(process.execPath,['frontend/scripts/pack.mjs']);
run('python3',['scripts/prepare-template.py']);
for(const name of ['Core','AspNetCore','EntityFrameworkCore','Identity','OData'])run('dotnet',['pack',`backend/src/BqAtlas.${name}/BqAtlas.${name}.csproj`,'-c','Release','-o','artifacts/nuget']);
run('dotnet',['pack','backend/templates/BqAtlas.Templates/BqAtlas.Templates.csproj','-c','Release','-o','artifacts/nuget']);

run('python3',['scripts/verify-package-docs.py']);
run(process.execPath,["scripts/artifact-manifest.mjs"]);
