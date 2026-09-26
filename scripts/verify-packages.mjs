import {artifactHashes} from './artifact-manifest.mjs';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const testedArtifacts=artifactHashes(root);
const work=join(root,'artifacts','verify-'+Date.now());mkdirSync(work,{recursive:true});
const nuget=join(root,'artifacts','nuget'),npm=join(root,'artifacts','npm');
const env={...process.env,NG_BUILD_PARALLEL_TS:'0',NG_BUILD_MAX_WORKERS:'1',NUGET_PACKAGES:join(work,'nuget-cache')};
function run(command,args,cwd=work){const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
const hive=join(work,'template-cache'),consumer=join(work,'consumer');
run('dotnet',['new','install',join(nuget,'BqAtlas.Templates.0.1.0-alpha.1.nupkg'),'--debug:custom-hive',hive]);
run('dotnet',['new','bqatlas','--no-update-check','-n','AcmeErp','-o',consumer,'--database','postgresql','--auth','local','--debug:custom-hive',hive]);
writeFileSync(join(work,'NuGet.config'),`<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear/><add key="bqatlas-local" value="${nuget}"/><add key="nuget" value="https://api.nuget.org/v3/index.json"/></packageSources><packageSourceMapping><packageSource key="bqatlas-local"><package pattern="BqAtlas.*"/></packageSource><packageSource key="nuget"><package pattern="*"/></packageSource></packageSourceMapping></configuration>`);
run('dotnet',['restore','AcmeErp.slnx'],consumer);run('dotnet',['build','AcmeErp.slnx','--no-restore'],consumer);run('dotnet',['test','tests/Unit','--no-restore'],consumer);
run('npm',['install',...['contracts','ui','angular'].map(name=>join(npm,`bqatlas-${name}-0.1.0-alpha.1.tgz`)),'--no-audit','--no-fund'],join(consumer,'client'));
run('npm',['run','build'],join(consumer,'client'));run('npm',['test'],join(consumer,'client'));
if(existsSync(join(consumer,'client/node_modules/pdfjs-dist')))throw new Error('Basic starter unexpectedly installed PDF.js.');
run('npm',['install',join(npm,'bqatlas-cli-0.1.0-alpha.1.tgz'),'--no-audit','--no-fund'],work);
run(process.execPath,['node_modules/@bqatlas/cli/bin/bqatlas.mjs','scaffold','master-data','--module','Purchasing','--entity','Supplier','--plural','Suppliers','--out',join(work,'supplier')]);
run('dotnet',['build','supplier/server/Modules/Purchasing/Purchasing.csproj']);
run('dotnet',['test','supplier/tests/Purchasing.Tests/Purchasing.Tests.csproj']);
run(process.execPath,['node_modules/@bqatlas/cli/bin/bqatlas.mjs','generate','crud','--spec','node_modules/@bqatlas/cli/examples/product.resource.json','--out',join(work,'products')]);
const products=join(work,'products'),productSpecPath=join(products,'resource.json');
const customPath=join(products,'server/Modules/Inventory/ProductRules.Custom.cs');
const customRule=`namespace App.Modules.Inventory;
public static partial class ProductRules
{
    static partial void ValidateCustom(ProductInput value, Dictionary<string,string[]> errors)
    {
        if (value.Sku == "BLOCKED") errors["sku"] = ["This SKU is blocked by an application rule."];
    }
}
`;
writeFileSync(customPath,customRule);
writeFileSync(join(products,'tests/Inventory.Tests/BusinessRulesTests.cs'),`using App.Modules.Inventory;
using BqAtlas.Core;
using Xunit;
namespace App.Tests;
public class BusinessRulesTests
{
    [Fact] public void RegenerationPreservesApplicationValidation()
    {
        var input = new ProductInput("BLOCKED", "Product", "", true, 0, new DateOnly(2026, 1, 1), "Stock", 0m, 0m);
        var error = Assert.Throws<ResourceValidationException>(() => ProductRules.Validate(input));
        Assert.Equal("This SKU is blocked by an application rule.", Assert.Single(error.Errors["sku"]));
    }
}
`);
const productSpec=JSON.parse(readFileSync(productSpecPath,'utf8'));
productSpec.fields.push({name:'weight',label:'Weight',type:'decimal',required:true,scale:3,maximum:'100000',default:'0'});
productSpec.form.fields.push('weight');productSpec.list.fields.push('weight');
writeFileSync(productSpecPath,JSON.stringify(productSpec,null,2)+'\n');
const regenerationArgs=['node_modules/@bqatlas/cli/bin/bqatlas.mjs','generate','crud','--spec',productSpecPath,'--out',products,'--regenerate'];
const preview=spawnSync(process.execPath,[...regenerationArgs,'--dry-run'],{cwd:work,env,encoding:'utf8'});
if(preview.status!==0)throw new Error(preview.stderr);
const regenerationPreview=JSON.parse(preview.stdout);
if(!regenerationPreview.changes.some(change=>change.path.endsWith('.Custom.cs')&&change.action==='preserve'))throw new Error('Regeneration did not preserve the custom validation extension.');
writeFileSync(join(work,'regeneration-preview.json'),preview.stdout);
run(process.execPath,regenerationArgs);
if(readFileSync(customPath,'utf8')!==customRule)throw new Error('Regeneration changed custom business rules.');
run('dotnet',['test','products/tests/Inventory.Tests']);
run('npm',['install',...['contracts','ui','angular'].map(name=>join(npm,`bqatlas-${name}-0.1.0-alpha.1.tgz`)),'--no-audit','--no-fund'],join(work,'products/client'));
run('npm',['test'],join(work,'products/client'));
copyFileSync(join(work,'products/client/feature.ts'),join(consumer,'client/projects/erp/src/generated-product.ts'));
writeFileSync(join(consumer,'client/projects/erp/src/main.ts'),readFileSync(join(consumer,'client/projects/erp/src/main.ts'),'utf8')+'\nimport {feature as generatedProductFeature} from "./generated-product";\nvoid generatedProductFeature;\n');
run('npm',['run','build'],join(consumer,'client'));
const namedSpec=JSON.parse(readFileSync(join(work,'node_modules/@bqatlas/cli/examples/product.resource.json'),'utf8'));
namedSpec.module='CustomersArchive';namedSpec.resource='customersarchive.products';
writeFileSync(join(work,'named-resource.json'),JSON.stringify(namedSpec));
run(process.execPath,['node_modules/@bqatlas/cli/bin/bqatlas.mjs','generate','crud','--spec',join(work,'named-resource.json'),'--out',join(work,'named-resource')]);
run('dotnet',['test','named-resource/tests/CustomersArchive.Tests']);
const configurations=[{database:'postgresql',auth:'local',backendBuild:true,backendUnitTests:true,frontendBuild:true,frontendUnitTests:true}];
for(const [database,auth] of [['postgresql','oidc'],['sqlserver','local'],['sqlserver','oidc']]) {
 const choices=join(work,`${database}-${auth}`);
 run('dotnet',['new','bqatlas','--no-update-check','-n','MatrixErp','-o',choices,'--database',database,'--auth',auth,'--debug:custom-hive',hive]);
 const settings=JSON.parse(readFileSync(join(choices,'server/Host/appsettings.json'),'utf8'));
 if(settings.Database.Provider!==database||settings.Authentication.Mode!==auth)throw new Error('Template options were not applied.');
 run(process.execPath,['scripts/setup-dev.mjs'],choices);
 const localSettings=readFileSync(join(choices,'.env'),'utf8');
 if(!localSettings.includes(`Database__Provider=${database}`)||!localSettings.includes(`Authentication__Mode=${auth}`))throw new Error('Development setup overrides template choices.');
 if(auth==='oidc') {
  run(process.execPath,['scripts/setup-keycloak.mjs'],choices);
  const realm=JSON.parse(readFileSync(join(choices,'artifacts/keycloak/bqatlas-realm.json'),'utf8'));
  const client=realm.clients.find(client=>client.clientId==='bqatlas');
  if(!client?.redirectUris.includes('http://127.0.0.1:4200/signin-oidc')||!realm.users.find(user=>user.username==='admin')?.realmRoles.includes('bqatlas-admin'))throw new Error('Generated Keycloak setup does not match the application.');
 }
 run('dotnet',['build','MatrixErp.slnx'],choices);
 run('dotnet',['test','tests/Unit','--no-restore'],choices);
 run('npm',['install',...['contracts','ui','angular'].map(name=>join(npm,`bqatlas-${name}-0.1.0-alpha.1.tgz`)),'--no-audit','--no-fund'],join(choices,'client'));
 run('npm',['run','build'],join(choices,'client'));
 run('npm',['test'],join(choices,'client'));
 if(existsSync(join(choices,'client/node_modules/pdfjs-dist')))throw new Error(`Basic ${database}/${auth} starter unexpectedly installed PDF.js.`);
 configurations.push({database,auth,backendBuild:true,backendUnitTests:true,frontendBuild:true,frontendUnitTests:true});
}
if(JSON.stringify(artifactHashes(root))!==JSON.stringify(testedArtifacts))throw new Error('Package artifacts changed during verification.');
writeFileSync(join(work,'verification.json'),JSON.stringify({passed:true,configurations,artifacts:testedArtifacts,template:'BqAtlas.Templates@0.1.0-alpha.1',backendBuild:true,backendUnitTests:true,frontendBuild:true,frontendUnitTests:true,optionalPdf:true,scaffoldBuild:true,scaffoldTests:true,resourceSpecBackendTests:true,resourceSpecFrontendTests:true,resourceSpecFrontendBuild:true,resourceRegeneration:true,generatorNamingBuild:true,templateOptions:true},null,2));
console.log(`Package consumer verification passed: ${work}`);
