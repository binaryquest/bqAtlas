import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
process.loadEnvFile('.env');
if(process.argv.includes('--keycloak')) {
 const settings=parseEnv(readFileSync('.env.keycloak','utf8'));
 for(const [key,value] of Object.entries(settings))if(key.startsWith('Authentication__'))process.env[key]=value;
}
const command=process.argv[2]??'run';
if(!['run','migrate','grant-dev','test:integration'].includes(command))throw new Error('Use run, migrate, grant-dev or test:integration.');
const env={...process.env};
if(command==='test:integration') {env.BQATLAS_TEST_CONNECTION=env.ConnectionStrings__Application;env.BQATLAS_TEST_PROVIDER=env.Database__Provider;}
const args=command==='test:integration'?['test','backend/tests/BqAtlas.IntegrationTests/BqAtlas.IntegrationTests.csproj']:['run','--project','samples/erp/server/Host',...(command==='migrate'?['--','--migrate']:command==='grant-dev'?['--','--grant-development-permissions']:[])];
const child=spawn('dotnet',args,{stdio:'inherit',env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
