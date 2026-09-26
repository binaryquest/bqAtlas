import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
const file=new URL('../.env',import.meta.url);
if(existsSync(file)){console.log('.env already exists; preserving your settings.');process.exit(0);}
const password=()=>randomBytes(24).toString('base64url')+'aA1!';
const db=password();
const settingsFile=new URL('../dev-settings.json',import.meta.url);
const settings=existsSync(settingsFile)?JSON.parse(readFileSync(settingsFile,'utf8')):{database:'postgresql',auth:'local'};
if(!['postgresql','sqlserver'].includes(settings.database)||!['local','oidc'].includes(settings.auth))throw new Error('Unsupported database or authentication setting.');
const connection=settings.database==='postgresql'?`Host=127.0.0.1;Port=25432;Database=bqatlas;Username=bqatlas;Password=${db}`:`Server=127.0.0.1,21433;Database=bqatlas;User Id=sa;Password=${db};TrustServerCertificate=true`;

writeFileSync(file,`COMPOSE_PROJECT_NAME=bqatlas_dev
POSTGRES_PASSWORD=${db}
MSSQL_SA_PASSWORD=${db}
ConnectionStrings__Application="${connection}"
Database__Provider=${settings.database}
Authentication__Mode=${settings.auth}
Identity__DevelopmentEmail=true
Identity__PublicOrigin=http://127.0.0.1:4200
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://localhost:5100
Bootstrap__Email=admin@bqatlas.local
Bootstrap__Password=${password()}
`,{mode:0o600});
console.log('Created .env with unique local database and development login credentials.');
