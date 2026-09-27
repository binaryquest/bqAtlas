import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {artifactHashes} from './artifact-manifest.mjs';
const review=process.argv.includes('--browser-review');
if(process.argv.slice(2).some(arg=>arg!=='--browser-review'))throw new Error('Supported option: --browser-review');
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
if(existsSync('.env'))process.loadEnvFile('.env');
const provider=process.env.BQATLAS_TEST_PROVIDER??process.env.Database__Provider??'postgresql';
const connection=process.env.BQATLAS_TEST_CONNECTION??process.env.ConnectionStrings__Application;
if(!['postgresql','sqlserver'].includes(provider)||!connection)throw new Error('Configure a disposable database server. The shared fixture creates/deletes only its unique test database.');
const artifactRoot=resolve(process.env.BQATLAS_ARTIFACT_ROOT??root),artifacts=artifactHashes(artifactRoot);
if(Object.keys(artifacts).length!==10)throw new Error('Build the complete local package set first.');
const work=join(root,'artifacts','module-runtime-'+Date.now()),consumer=join(work,'consumer');mkdirSync(work,{recursive:true});
const env={...process.env,NUGET_PACKAGES:join(work,'nuget-cache'),NG_BUILD_PARALLEL_TS:'0',NG_BUILD_MAX_WORKERS:'1',BQATLAS_TEST_PROVIDER:provider,BQATLAS_TEST_CONNECTION:connection,BQATLAS_DATABASE_LIFECYCLE:join(work,'database-lifecycle.json'),BQATLAS_STARTER_AUTH:'local',BQATLAS_STARTER_URLS:'http://127.0.0.1:0',BQATLAS_STARTER_HOST:join(consumer,'server/Host/bin/Debug/net10.0/Host.dll'),BQATLAS_STARTER_DIRECTORY:join(consumer,'server/Host')};
if(review)env.BQATLAS_BROWSER_REVIEW=join(work,'browser-review.json');
function run(command,args,cwd=consumer){const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(result.status!==0)throw new Error(`${command} failed (${result.status??result.signal}).`);}
function replace(path,before,after,count=1){const file=join(consumer,path),source=readFileSync(file,'utf8');if(source.split(before).length-1!==count)throw new Error(`Walkthrough anchor changed: ${path}`);writeFileSync(file,source.replaceAll(before,after));}
const nuget=join(artifactRoot,'artifacts/nuget'),npm=join(artifactRoot,'artifacts/npm'),hive=join(work,'template-cache');
writeFileSync(join(work,'NuGet.config'),`<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear/><add key="bqatlas-local" value="${nuget}"/><add key="nuget" value="https://api.nuget.org/v3/index.json"/></packageSources><packageSourceMapping><packageSource key="bqatlas-local"><package pattern="BqAtlas.*"/></packageSource><packageSource key="nuget"><package pattern="*"/></packageSource></packageSourceMapping></configuration>`);
run('dotnet',['new','install',join(nuget,'BqAtlas.Templates.0.1.0-alpha.1.nupkg'),'--debug:custom-hive',hive],work);
run('dotnet',['new','bqatlas','--no-update-check','-n','AcmeErp','-o',consumer,'--database',provider,'--auth','local','--debug:custom-hive',hive],work);
run('npm',['install',join(npm,'bqatlas-cli-0.1.0-alpha.1.tgz'),'--no-audit','--no-fund'],work);
run(process.execPath,[join(work,'node_modules/@bqatlas/cli/bin/bqatlas.mjs'),'generate','crud','--spec','resource-specs/inventory/product.resource.json','--out','features/inventory']);
const module='features/inventory/server/Modules/Inventory/Inventory.csproj';
for(const project of ['server/Host/Host.csproj','server/Migrations/PostgreSql/PostgreSql.csproj','server/Migrations/SqlServer/SqlServer.csproj'])run('dotnet',['add',project,'reference',module]);
replace('server/Host/Program.cs','using AcmeErp.Crm;','using AcmeErp.Crm;\nusing App.Modules.Inventory;');
replace('server/Host/Program.cs','builder.Services.AddBqAtlasHttp(registry);','registry.AddModule(new InventoryModule(options => ConfigureDatabase(options, "inventory")));\nregistry.AddResource(InventoryModule.Resource);\nbuilder.Services.AddBqAtlasHttp(registry);');
replace('server/Host/Program.cs','.AddApplicationPart(typeof(CustomersController).Assembly)', '.AddApplicationPart(typeof(CustomersController).Assembly).AddApplicationPart(typeof(ProductsController).Assembly)');
replace('server/Host/Program.cs','.AddRouteComponents("odata/v1/crm", CrmModule.ReadModel())', '.AddRouteComponents("odata/v1/crm", CrmModule.ReadModel()).AddRouteComponents("odata/v1/inventory", InventoryModule.ReadModel())');
replace('server/Host/Program.cs','await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Database.MigrateAsync();','await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Database.MigrateAsync();\n    await scope.ServiceProvider.GetRequiredService<InventoryDbContext>().Database.MigrateAsync();');
replace('server/Host/Program.cs','CrmPermissions.All.Concat(SalesPermissions.All)','CrmPermissions.All.Concat(SalesPermissions.All).Concat(InventoryPermissions.All)',2);
const settingsPath=join(consumer,'server/Host/appsettings.json'),settings=JSON.parse(readFileSync(settingsPath,'utf8'));
settings.Authentication.RolePermissions['bqatlas-admin'].push('inventory.products.read','inventory.products.write','inventory.products.delete','inventory.products.lookup');
settings.Authentication.RolePermissions['bqatlas-reader'].push('inventory.products.read','inventory.products.lookup');
writeFileSync(settingsPath,JSON.stringify(settings,null,2)+'\n');
for(const [name,method,connection] of [['PostgreSql','UseNpgsql','Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only'],['SqlServer','UseSqlServer','Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true']]){
 writeFileSync(join(consumer,`server/Migrations/${name}/InventoryDbContextFactory.cs`),`using App.Modules.Inventory;\nusing Microsoft.EntityFrameworkCore;\nusing Microsoft.EntityFrameworkCore.Design;\nnamespace AcmeErp.Migrations.${name};\npublic sealed class InventoryDbContextFactory : IDesignTimeDbContextFactory<InventoryDbContext>\n{\n    public InventoryDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<InventoryDbContext>().${method}("${connection}", o => o.MigrationsAssembly(typeof(InventoryDbContextFactory).Assembly.FullName).MigrationsHistoryTable("__EFMigrationsHistory", "inventory")).Options);\n}\n`);
}
run('dotnet',['restore','AcmeErp.slnx']);
run('dotnet',['tool','restore','--tool-manifest','dotnet-tools.json']);
for(const name of ['PostgreSql','SqlServer'])run('dotnet',['ef','migrations','add','InitialInventory','--context','InventoryDbContext','--project',`server/Migrations/${name}`,'--startup-project',`server/Migrations/${name}`,'--output-dir','Inventory']);
copyFileSync(join(consumer,'features/inventory/client/feature.ts'),join(consumer,'client/projects/erp/src/inventory-feature.ts'));
replace('client/projects/erp/src/main.ts','import { salesFeature }','import { feature as inventoryFeature, menu as inventoryMenu } from "./inventory-feature";\nimport { salesFeature }');
replace('client/projects/erp/src/main.ts','      salesFeature,','      salesFeature,\n      inventoryFeature,');
replace('client/projects/erp/src/main.ts','    this.menus.register(','    this.menus.register(\n      inventoryMenu,');
run('dotnet',['build','AcmeErp.slnx']);
run('dotnet',['test','features/inventory/tests/Inventory.Tests']);
const peers=['contracts','ui','angular'].map(name=>join(npm,`bqatlas-${name}-0.1.0-alpha.1.tgz`));
for(const folder of ['client','features/inventory/client']){run('npm',['install',...peers,'--no-audit','--no-fund'],join(consumer,folder));run('npm',['test'],join(consumer,folder));}
run('npm',['run','build'],join(consumer,'client'));
cpSync(join(consumer,'client/dist/erp/browser'),join(consumer,'server/Host/wwwroot'),{recursive:true});
cpSync(join(root,'scripts/module-runtime'),join(work,'runtime'),{recursive:true});
copyFileSync(join(root,'scripts/starter-runtime/StarterFixture.cs'),join(work,'runtime/StarterFixture.cs'));
run('dotnet',['test','runtime/ModuleTests.csproj','--logger','trx;LogFileName=module.trx','--results-directory',join(work,'results')],work);
if(JSON.stringify(artifactHashes(artifactRoot))!==JSON.stringify(artifacts))throw new Error('Artifacts changed during verification.');
writeFileSync(join(work,'verification.json'),JSON.stringify({passed:true,provider,artifacts,installedTemplate:true,packagedGenerator:true,bothMigrationSetsGenerated:true,realMigrationsAppliedTwice:true,localIdentityPermissionGrant:true,manifest:true,restCrud:true,odataRead:true,restartPersistence:true,frontendFeatureAndMenuBuild:true,generatedUnitTests:true,isolatedDatabase:true,browserRendered:false,browserReviewRequested:review},null,2)+'\n');
console.log(`Module walkthrough passed: ${work}`);
