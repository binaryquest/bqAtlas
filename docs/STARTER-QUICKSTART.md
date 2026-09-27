# Create an application from the unpublished preview

Start with .NET SDK 10.0.201+, Node 24.15+, npm and Docker. The repository sample runs directly from source; creating a separate application requires the local packages below because this preview has not been published to npm or NuGet.

## Build the local release set

```sh
git clone https://github.com/binaryquest/bqAtlas.git
cd bqAtlas
npm ci --prefix frontend
node scripts/pack.mjs
```

Keep this terminal open. Capture the absolute artifact path, then generate a sibling application:

```sh
BQATLAS_ARTIFACTS="$PWD/artifacts"
dotnet new install "$BQATLAS_ARTIFACTS/nuget/BqAtlas.Templates.0.1.0-alpha.1.nupkg"
dotnet new bqatlas -n MyErp -o ../MyErp --database postgresql --auth local --no-update-check
cd ../MyErp
```

Create `NuGet.config` in `MyErp` with the following content. Replace `/absolute/path/to/bqAtlas/artifacts/nuget` with the directory created above. Keeping this configuration in the application also makes later builds, tests and migrations resolve unpublished packages correctly.

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="bqatlas-local" value="/absolute/path/to/bqAtlas/artifacts/nuget" />
    <add key="nuget" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="bqatlas-local"><package pattern="BqAtlas.*" /></packageSource>
    <packageSource key="nuget"><package pattern="*" /></packageSource>
  </packageSourceMapping>
</configuration>
```

Install all three frontend peers together and build:

```sh
npm install --prefix client "$BQATLAS_ARTIFACTS/npm/bqatlas-contracts-0.1.0-alpha.1.tgz" "$BQATLAS_ARTIFACTS/npm/bqatlas-ui-0.1.0-alpha.1.tgz" "$BQATLAS_ARTIFACTS/npm/bqatlas-angular-0.1.0-alpha.1.tgz"
dotnet build MyErp.slnx
npm run build --prefix client
dotnet test tests/Unit
npm test --prefix client
```

## Start and explore

```sh
node scripts/setup-dev.mjs
docker compose up -d postgres --wait
node scripts/backend.mjs migrate
node scripts/backend.mjs run
```

In another terminal, from `MyErp`, run `npm start --prefix client`. Open http://127.0.0.1:4200 and use `Bootstrap__Email` and `Bootstrap__Password` from your private `.env`. Re-running setup preserves the file. Never commit it.

Open Customers or Sales quotes to use real database records. Open **Explore forms & controls** on the home screen or **Forms & controls** in the Start menu for in-memory examples, including master/child forms, multi-column lookup and advanced tables.

The default local ports are 4200 (frontend), 5100 (backend) and 25432 (PostgreSQL). Stop another bqAtlas preview using those ports before starting this one. Separate applications should use their own Compose project name, ports and database credentials; the default development project name is `bqatlas_dev`.

## Scaffold your first module

From `MyErp`, install the matching CLI, then generate the sample Product module:

```sh
npm install --save-dev "$BQATLAS_ARTIFACTS/npm/bqatlas-cli-0.1.0-alpha.1.tgz"
npx --no-install bqatlas generate crud --spec resource-specs/inventory/product.resource.json --out ./inventory-module
dotnet test inventory-module/tests/Inventory.Tests
```

Follow [the module-authoring walkthrough](MODULE-AUTHORING.md) for concrete host, migration, permission and frontend registration steps. That walkthrough retains generated output under `features/inventory`; use one output location consistently. Generation intentionally leaves these application decisions explicit. See [RESOURCE-GENERATION.md](RESOURCE-GENERATION.md) for field types and safe regeneration.

## Other choices and troubleshooting

- SQL Server: generate with `--database sqlserver`; on Linux x64 use `docker compose --profile sqlserver up -d sqlserver`, wait for SQL Server readiness, then run migrations. Both providers run in CI; PostgreSQL is the local choice on Apple Silicon.
- External login: follow the repository's Keycloak instructions or configure an OIDC provider before using `--auth oidc`. The local-password flow is disabled in OIDC mode.
- npm cache permissions: use a writable dedicated cache, for example `npm_config_cache=/tmp/bqatlas-npm-cache npm ci --prefix frontend` in the source repository. Apply the same environment setting to package commands if needed.
- Docker address-pool exhaustion: allocate an unused subnet through a local Compose override, or resolve unused networks yourself. Do not prune other projects' networks as part of setup.
- Rebuilding this unpublished version: use isolated package caches for verification, as `scripts/verify-packages.mjs` does. Reusing the same alpha version can otherwise select older locally cached bytes.

## Verification evidence

The automated consumer workflow generates all four database/authentication combinations, builds and tests both applications, and compiles/tests scaffolded modules. The CI database jobs additionally run generated CRUD and the installed starter against real PostgreSQL and SQL Server. External-provider browser behavior requires separate live OIDC verification.
