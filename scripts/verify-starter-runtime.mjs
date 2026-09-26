import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {artifactHashes} from './artifact-manifest.mjs';
const review=process.argv.includes('--browser-review');
if(process.argv.slice(2).some(arg=>arg!=='--browser-review'))throw new Error('Supported option: --browser-review');
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
if(existsSync('.env'))process.loadEnvFile('.env');
const provider=process.env.BQATLAS_TEST_PROVIDER??process.env.Database__Provider??'postgresql';
const connection=process.env.BQATLAS_TEST_CONNECTION??process.env.ConnectionStrings__Application;
if(!['postgresql','sqlserver'].includes(provider)||!connection)throw new Error('Configure a disposable database server through BQATLAS_TEST_PROVIDER and BQATLAS_TEST_CONNECTION (or local development settings).');
const artifacts=artifactHashes(root),work=join(root,'artifacts','starter-runtime-'+Date.now()),consumer=join(work,'consumer');mkdirSync(work,{recursive:true});
const env={...process.env,NG_BUILD_PARALLEL_TS:'0',NG_BUILD_MAX_WORKERS:'1',NUGET_PACKAGES:join(work,'nuget-cache'),BQATLAS_TEST_PROVIDER:provider,BQATLAS_TEST_CONNECTION:connection,BQATLAS_DATABASE_LIFECYCLE:join(work,'database-lifecycle.json'),BQATLAS_STARTER_HOST:join(consumer,'server/Host/bin/Debug/net10.0/Host.dll'),BQATLAS_STARTER_DIRECTORY:join(consumer,'server/Host')};
if(review){env.BQATLAS_BROWSER_REVIEW=join(work,'browser-review.json');console.log(`Browser review will become available in ${env.BQATLAS_BROWSER_REVIEW}; create its .done marker to finish and clean up.`);}
function run(command,args,cwd=work){const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(result.status!==0)throw new Error(`${command} failed (${result.status}).`);}
const nuget=join(root,'artifacts/nuget'),hive=join(work,'template-cache');
writeFileSync(join(work,'NuGet.config'),`<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear/><add key="bqatlas-local" value="${nuget}"/><add key="nuget" value="https://api.nuget.org/v3/index.json"/></packageSources><packageSourceMapping><packageSource key="bqatlas-local"><package pattern="BqAtlas.*"/></packageSource><packageSource key="nuget"><package pattern="*"/></packageSource></packageSourceMapping></configuration>`);
run('dotnet',['new','install',join(nuget,'BqAtlas.Templates.0.1.0-alpha.1.nupkg'),'--debug:custom-hive',hive]);
run('dotnet',['new','bqatlas','--no-update-check','-n','AcmeErp','-o',consumer,'--database',provider,'--auth','local','--debug:custom-hive',hive]);
run('dotnet',['build','AcmeErp.slnx'],consumer);
run('npm',['install',...['contracts','ui','angular'].map(name=>join(root,`artifacts/npm/bqatlas-${name}-0.1.0-alpha.1.tgz`)),'--no-audit','--no-fund'],join(consumer,'client'));
run('npm',['run','build'],join(consumer,'client'));
cpSync(join(consumer,'client/dist/erp/browser'),join(consumer,'server/Host/wwwroot'),{recursive:true});
cpSync(join(root,'scripts/starter-runtime'),join(work,'runtime'),{recursive:true});
run('dotnet',['test','runtime/StarterTests.csproj','--logger','trx;LogFileName=starter.trx','--results-directory',join(work,'results')]);
if(JSON.stringify(artifactHashes(root))!==JSON.stringify(artifacts))throw new Error('Artifacts changed during starter runtime verification.');
writeFileSync(join(work,'verification.json'),JSON.stringify({passed:true,provider,artifacts,installedTemplate:true,actualGeneratedHost:true,angularAssetsServed:true,realLocalIdentity:true,customerCrud:true,quoteSubmissionAndReplay:true,exactQuoteTotal:'26.24',realMigrationsAppliedTwice:true,restartPersistence:true,logout:true,isolatedDatabase:true,browserRendered:false,oidcRuntime:false},null,2)+'\n');
console.log(`Generated starter runtime verification passed: ${work}`);
