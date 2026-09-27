import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,cpSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {artifactHashes} from './artifact-manifest.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
if(existsSync('.env'))process.loadEnvFile('.env');
const provider=process.env.BQATLAS_TEST_PROVIDER??process.env.Database__Provider??'postgresql';
const connection=process.env.BQATLAS_TEST_CONNECTION??process.env.ConnectionStrings__Application;
if(!['postgresql','sqlserver'].includes(provider)||!connection)throw new Error('Configure a disposable database server through BQATLAS_TEST_PROVIDER and BQATLAS_TEST_CONNECTION. Only a uniquely named test database is created/deleted.');
// Allows testing a previously verified release set without rebuilding or replacing it.
const artifactRoot=resolve(process.env.BQATLAS_ARTIFACT_ROOT??root);
const artifacts=artifactHashes(artifactRoot);
if(Object.keys(artifacts).length!==10)throw new Error('Build all ten local package artifacts first.');
const work=join(root,'artifacts','keycloak-runtime-'+Date.now()),consumer=join(work,'consumer');
mkdirSync(work,{recursive:true,mode:0o700});
const env={...process.env,NUGET_PACKAGES:join(work,'nuget-cache'),BQATLAS_TEST_PROVIDER:provider,BQATLAS_TEST_CONNECTION:connection,BQATLAS_DATABASE_LIFECYCLE:join(work,'database-lifecycle.json'),BQATLAS_STARTER_AUTH:'oidc',BQATLAS_STARTER_HOST:join(consumer,'server/Host/bin/Debug/net10.0/Host.dll'),BQATLAS_STARTER_DIRECTORY:join(consumer,'server/Host')};
function run(command,args,cwd=work){const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(result.status!==0)throw new Error(`${command} failed (${result.status??result.signal}).`);}
async function freePort(){const server=createServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});const port=server.address().port;await new Promise(ok=>server.close(ok));return port;}
const nuget=join(artifactRoot,'artifacts/nuget'),hive=join(work,'template-cache');
writeFileSync(join(work,'NuGet.config'),`<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear/><add key="bqatlas-local" value="${nuget}"/><add key="nuget" value="https://api.nuget.org/v3/index.json"/></packageSources><packageSourceMapping><packageSource key="bqatlas-local"><package pattern="BqAtlas.*"/></packageSource><packageSource key="nuget"><package pattern="*"/></packageSource></packageSourceMapping></configuration>`);
run('dotnet',['new','install',join(nuget,'BqAtlas.Templates.0.1.0-alpha.1.nupkg'),'--debug:custom-hive',hive]);
run('dotnet',['new','bqatlas','--no-update-check','-n','AcmeErp','-o',consumer,'--database',provider,'--auth','oidc','--debug:custom-hive',hive]);
run('dotnet',['build','AcmeErp.slnx'],consumer);
cpSync(join(root,'scripts/keycloak-runtime'),join(work,'runtime'),{recursive:true});
copyFileSync(join(root,'scripts/starter-runtime/StarterFixture.cs'),join(work,'runtime/StarterFixture.cs'));
run(process.execPath,['scripts/setup-keycloak.mjs'],consumer);
const settings=parseEnv(readFileSync(join(consumer,'.env.keycloak'),'utf8'));
const appPort=await freePort();let providerPort=await freePort();while(providerPort===appPort)providerPort=await freePort();
const appOrigin=`http://127.0.0.1:${appPort}`,providerOrigin=`http://127.0.0.1:${providerPort}`;
const realmPath=join(consumer,'artifacts/keycloak/bqatlas-realm.json');
const realm=JSON.parse(readFileSync(realmPath,'utf8'));
const client=realm.clients.find(c=>c.clientId==='bqatlas');
client.redirectUris=[appOrigin+'/signin-oidc'];client.webOrigins=[appOrigin];
client.attributes['post.logout.redirect.uris']=appOrigin+'/signout-callback-oidc';
writeFileSync(realmPath,JSON.stringify(realm),{mode:0o600});
Object.assign(env,{Authentication__Oidc__Authority:providerOrigin+'/realms/bqatlas',Authentication__Oidc__ClientId:'bqatlas',Authentication__Oidc__ClientSecret:settings.Authentication__Oidc__ClientSecret,Authentication__Oidc__RequireHttpsMetadata:'false',BQATLAS_KEYCLOAK_PASSWORD:settings.KEYCLOAK_TEST_PASSWORD,BQATLAS_STARTER_URLS:appOrigin});
const container='bqatlas-keycloak-test-'+randomUUID();
const image=process.env.BQATLAS_KEYCLOAK_IMAGE??'quay.io/keycloak/keycloak:26.7.0';
let started=false,passed=false,cleanupPassed=false,imageIdentity='';
try {
  // Root is confined to this disposable container, allowing the private 0600 import
  // file to stay private on the host. No privileged mode or host network is used.
  run('docker',['run','--rm','-d','--name',container,'--user','0:0','-p',`127.0.0.1:${providerPort}:8080`,'--mount',`type=bind,src=${join(consumer,'artifacts/keycloak')},dst=/opt/keycloak/data/import,readonly`,'-e',`KC_HOSTNAME=${providerOrigin}`,image,'start-dev','--import-realm']);
  started=true;
  const inspection=spawnSync('docker',['inspect','--format','{{.Image}}',container],{encoding:'utf8'});
  if(inspection.status!==0)throw new Error('Unable to record the provider image identity.');imageIdentity=inspection.stdout.trim();
  let ready=false;
  for(let i=0;i<120;i++){
    try {const response=await fetch(env.Authentication__Oidc__Authority+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(1000)});if(response.ok){const discovery=await response.json();if(discovery.issuer!==env.Authentication__Oidc__Authority)throw new Error('Unexpected issuer.');ready=true;break;}}catch{}
    await new Promise(ok=>setTimeout(ok,1000));
  }
  if(!ready)throw new Error('Isolated Keycloak did not become ready within the startup deadline.');
  console.log('Live Keycloak is ready; testing authorization-code/PKCE login, role permissions, draft denial and logout.');
  run('dotnet',['test','runtime/KeycloakTests.csproj','--logger','trx;LogFileName=keycloak.trx','--results-directory',join(work,'results')]);
  if(JSON.stringify(artifactHashes(artifactRoot))!==JSON.stringify(artifacts))throw new Error('Package artifacts changed during verification.');
  passed=true;
} finally {
  try {
    if(started)run('docker',['rm','-f',container]);
    cleanupPassed=true;
  } finally {
    rmSync(join(consumer,'.env.keycloak'),{force:true});rmSync(join(consumer,'artifacts/keycloak'),{recursive:true,force:true});
    writeFileSync(join(work,'verification.json'),JSON.stringify({passed:passed&&cleanupPassed,provider,artifacts,keycloakImage:image,keycloakImageIdentity:imageIdentity,containerRemoved:cleanupPassed,privateRealmRemoved:true,realProvider:started,authorizationCodePkce:passed,syntheticApplicationTickets:false,checks:passed?['admin-create','reader-exact-permissions','reader-rest-odata-lookup','draft-capabilities','seven-reader-write-denials','unchanged-record-versions','unassigned-read-denials','application-and-provider-logout']:[]},null,2)+'\n');
  }
}
console.log(`Live Keycloak verification passed: ${work}`);
