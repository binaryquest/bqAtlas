from pathlib import Path
import json, shutil, re
root=Path(__file__).resolve().parent.parent
out=root/'backend/templates/BqAtlas.Templates/content'
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
def put(p,s):
 p=out/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def copytree(src,dest):
 for p in (root/src).rglob('*'):
  if p.is_file() and not any(x in {'bin','obj','node_modules','dist','.angular','.local-mail'} for x in p.relative_to(root/src).parts):
   put(str(Path(dest)/p.relative_to(root/src)),p.read_text())
def js(p,v): put(p,json.dumps(v,indent=2)+'\n')
copytree('samples/erp/server','server')
copytree('contracts','contracts')
copytree('resource-specs','resource-specs')
for p in (out/'server').rglob('*.csproj'):
 s=p.read_text()
 s=re.sub(r'<ProjectReference Include="[^"]*backend/src/([^/]+)/[^"/]+"\s*/>',r'<PackageReference Include="\1" />',s)
 p.write_text(s)
copytree('frontend/projects/erp','client/projects/erp')
put('client/projects/erp/src/styles.css',(root/'frontend/projects/erp/src/styles.css').read_text())
a=json.loads((root/'frontend/angular.json').read_text());a['projects']={'erp':a['projects']['erp']};js('client/angular.json',a)
t=json.loads((root/'frontend/tsconfig.json').read_text());t['compilerOptions'].pop('paths');js('client/tsconfig.json',t)
p=json.loads((root/'frontend/package.json').read_text());p['name']='bqatlas-sample';p['scripts']={'build':'ng build erp','start':'ng serve erp --host 127.0.0.1 --port 4200','test':'node --test tests/*.test.mjs'}
for name in ['ui','angular','contracts']:p['dependencies']['@bqatlas/'+name]='0.1.0-alpha.1'
p['dependencies'].pop('pdfjs-dist',None)
for name in ['ng-packagr','@tailwindcss/postcss','tailwindcss','postcss','prettier']:p['devDependencies'].pop(name,None)
js('client/package.json',p)
put('client/tests/draft.test.mjs',"import '@angular/compiler';\nimport {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {RecordDraft} from '@bqatlas/angular';\ntest('independent drafts preserve saved records',()=>{const a=new RecordDraft(),b=new RecordDraft();const data={name:'Original'};a.accept({data,version:'1'});b.accept({data,version:'1'});a.change('name','Edited');assert.equal(b.value().name,'Original');a.revert();assert.equal(a.value().name,'Original');});\n")
put('client/tests/quote.test.mjs',(root/'frontend/tests/quote.test.mjs').read_text().replace("../projects/contracts/dist/index.js","@bqatlas/contracts").replace("../dist/angular/fesm2022/bqatlas-angular.mjs","@bqatlas/angular"))
for test_name in ['fields','menus','workspace-exit','navigation','password-change','account-recovery','framework','layouts','hierarchies','commands']:
 source=(root/f'frontend/tests/{test_name}.test.mjs').read_text().replace('../dist/angular/fesm2022/bqatlas-angular.mjs','@bqatlas/angular').replace('../dist/ui/fesm2022/bqatlas-ui.mjs','@bqatlas/ui')
 put(f'client/tests/{test_name}.test.mjs',source)
for name in ['Directory.Build.props','Directory.Packages.props','global.json','dotnet-tools.json','.gitignore','LICENSE']:put(name,(root/name).read_text())
p=out/'Directory.Packages.props';s=p.read_text().replace('</ItemGroup>',''.join(f'<PackageVersion Include="BqAtlas.{name}" Version="0.1.0-alpha.1" />\n' for name in ['Core','AspNetCore','Identity','EntityFrameworkCore','OData'])+'</ItemGroup>');p.write_text(s)
copytree('backend/tests/BqAtlas.Tests','tests/Unit')
p=out/'tests/Unit/BqAtlas.Tests.csproj';s=p.read_text().replace('../../src/BqAtlas.Core/BqAtlas.Core.csproj','PACKAGE_CORE').replace('../../../samples/erp/server/Modules/Crm/Crm.csproj','../../server/Modules/Crm/Crm.csproj').replace('../../../samples/erp/server/Modules/Sales/Sales.csproj','../../server/Modules/Sales/Sales.csproj').replace('../../../contracts/','../../contracts/').replace('<ProjectReference Include="PACKAGE_CORE" />','<PackageReference Include="BqAtlas.Core" />');p.write_text(s)
put('BqAtlas.Sample.slnx','<Solution><Project Path="server/Host/Host.csproj"/><Project Path="tests/Unit/BqAtlas.Tests.csproj"/></Solution>\n')
copytree('scripts/starter','scripts')
put('scripts/setup-dev.mjs',(root/'scripts/setup-dev.mjs').read_text())
s=(root/'scripts/backend.mjs').read_text().replace('samples/erp/server/Host','server/Host');s=s.replace("'run','migrate','grant-dev','test:integration'","'run','migrate','grant-dev'");put('scripts/backend.mjs',s)
put('compose.yaml',(root/'compose.yaml').read_text())
# Replace only specific default values with template symbols.
p=out/'server/Host/appsettings.json';c=json.loads(p.read_text());c['Database']['Provider']='__BQATLAS_DATABASE_PROVIDER__';c['Authentication']['Mode']='__BQATLAS_AUTH_MODE__';js('server/Host/appsettings.json',c)
js('dev-settings.json',{'database':'__BQATLAS_DATABASE_PROVIDER__','auth':'__BQATLAS_AUTH_MODE__'})
put('README.md','''# BqAtlas.Sample

Generated bqAtlas development starter, ASP.NET Core 10 + Angular 22.

To integrate a generated resource, follow the [module-authoring walkthrough](https://github.com/binaryquest/bqAtlas/blob/main/docs/MODULE-AUTHORING.md), including provider migrations and explicit permission grants.

1. Install .NET SDK 10.0.201+, Node 24.15+, and Docker.
2. Run `node scripts/setup-dev.mjs`. Open the generated `.env` to see your unique development account credentials.
3. Run `docker compose --profile postgresql up -d --wait` (or use your SQL Server connection and set `Database__Provider=sqlserver`).
4. Run `node scripts/backend.mjs migrate`, then `node scripts/backend.mjs run`.
5. In `client`, run `npm install`, then `npm start`. Open http://127.0.0.1:4200.
6. Run `dotnet test tests/Unit` and `npm test --prefix client` for unit tests.

For the isolated development Keycloak profile, run `node scripts/setup-keycloak.mjs`, `docker compose --profile oidc up -d keycloak`, then `node scripts/backend.mjs run --keycloak`. Use http://127.0.0.1:4200. Generated credentials are in the ignored `.env.keycloak`. Existing realm state and credentials are preserved on repeated setup.

For another OIDC provider, set `Authentication__Mode=oidc`, `Authentication__Oidc__Authority`, `Authentication__Oidc__ClientId`, and `Authentication__Oidc__ClientSecret` in `.env`. Register `/signin-oidc` and `/signout-callback-oidc` under your frontend origin. `Authentication__Oidc__RequireHttpsMetadata=false` is only for a local HTTP development identity provider. Map provider roles to permission IDs in `server/Host/appsettings.json`. Local login is disabled in OIDC mode. Generic OAuth2-only providers need an explicit identity adapter; the built-in external flow requires OpenID Connect.

Each module owns its DbContext and schema. Add migrations to both provider projects; run `dotnet tool restore` first. CRM and Sales demonstrate metadata CRUD and a custom quote aggregate. If updating an existing development database, explicitly run `node scripts/backend.mjs grant-dev`, then sign in again to receive the new module permissions. Public account registration is disabled; bootstrap only creates a new local account in Development. Local change-password, password-reset and email-confirmation forms are included. New development settings enable a private `.local-mail` outbox under the host content root; add `Identity__DevelopmentEmail=true` and `Identity__PublicOrigin=http://127.0.0.1:4200` to older development configurations to use it. Real email delivery is application configuration. MFA and account-administration UI are not included.

The server owns validation, permissions, concurrency, and calculation rules. Do not rely on menu visibility for authorization. Multi-tenant isolation is not implemented. Production deployment requires HTTPS, a shared persisted data-protection key ring for multiple instances, and explicit database migration/provisioning. Forwarded proxy headers must be restricted to trusted proxies.

The starter includes `resource-specs/inventory/product.resource.json`. Use `bqatlas generate crud --spec resource-specs/inventory/product.resource.json --out inventory-module --dry-run` to preview a resource module, then omit `--dry-run` to generate it. Explicit `--regenerate` updates unchanged generated files while preserving custom validation; inspect its dry-run plan before applying changes.

Build the frontend with `npm run build --prefix client`; deploy `client/dist/erp/browser` into the host's `wwwroot` before publishing the server.

These packages are a development preview. If registry publication has not occurred, install npm tarballs from your local bqAtlas `artifacts/npm` folder and add `artifacts/nuget` as a NuGet source before restoring.
''')
js('.template.config/template.json',{'$schema':'http://json.schemastore.org/template','author':'Binary Quest','classifications':['Web','ERP','Angular'],'identity':'BqAtlas.Starter','name':'bqAtlas ERP starter','shortName':'bqatlas','sourceName':'BqAtlas.Sample','preferNameDirectory':True,'tags':{'language':'C#','type':'project'},'symbols':{'database':{'type':'parameter','datatype':'choice','defaultValue':'postgresql','choices':[{'choice':'postgresql','description':'PostgreSQL'},{'choice':'sqlserver','description':'SQL Server'}],'replaces':'__BQATLAS_DATABASE_PROVIDER__'},'auth':{'type':'parameter','datatype':'choice','defaultValue':'local','choices':[{'choice':'local','description':'ASP.NET Core Identity'},{'choice':'oidc','description':'External OpenID Connect provider'}],'replaces':'__BQATLAS_AUTH_MODE__'}}})
print('Prepared full-stack package-consumer template.')

put('scripts/setup-keycloak.mjs',(root/'scripts/setup-keycloak.mjs').read_text())
