# bqAtlas

An ERP application framework and starter kit: ASP.NET Core 10, Angular 22, Atlas UI, module-owned persistence, permission-aware views, and quick CRUD scaffolding. This repository is the new product; the original Atlas and bqStart repositories remain separate.

**Status: first working development preview, `0.1.0-alpha.1`.** This implements customer master data and a Sales quote aggregate. The complete first-release architecture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); outstanding work is tracked in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

To create a separate application using the unpublished packages, follow [the starter quickstart](docs/STARTER-QUICKSTART.md).

## Run the sample

Requires .NET SDK 10.0.201+, Node 24.15+, npm, and Docker. The PostgreSQL container uses its own volume and localhost port 25432.

```sh
node scripts/setup-dev.mjs
docker compose up -d postgres --wait
node scripts/backend.mjs migrate
node scripts/backend.mjs run
```

In a second terminal:

```sh
cd frontend
npm ci
npm run build:libs
npm start
```

Open **http://127.0.0.1:4200**. The unique development email/password are in the ignored `.env` file, under `Bootstrap__Email` and `Bootstrap__Password`. The bootstrap creates a new user only in Development; it never resets or elevates an existing user. No password is stored in committed configuration.

Open **Explore forms & controls** on the home screen, or **Forms & controls** in the Start menu, to try the integrated [showcase](docs/SHOWCASE.md).

## What works now

- Atlas workspace with retained, independent customer editors, dirty-close prompts, async save, permission-filtered menus, server errors, and session cleanup.
- CRM module with validated REST CRUD, search/filter/sort/paging, audit fields, optimistic concurrency (`If-Match`), and bounded OData reads over public DTOs.
- Sales quotes with independent master/detail editors, remote customer lookup, exact decimal-string amounts, atomic header/line updates, audit records, ETags and idempotent submission.
- Local ASP.NET Core Identity cookie login/logout and verified password change, CSRF protection, login throttling, and standard external OIDC configuration with authorization code + PKCE.
- PostgreSQL and SQL Server provider selection with separate CRM, Sales and Identity migrations. Both providers pass CI integration, generated CRUD and installed starter runtime checks.
- Four npm packages, five framework NuGet packages, a sixth NuGet template package, and a master-data scaffolding CLI. Artifacts are built locally; nothing has been published to public registries.

## Packages

| npm | Purpose |
| --- | --- |
| `@bqatlas/contracts` | Framework-independent HTTP types |
| `@bqatlas/ui` | Atlas controls, workspace, theme; optional `/documents` entry point |
| `@bqatlas/angular` | Session, permissions, registered features, API provider, generic CRUD views |
| `@bqatlas/cli` | Resource-spec scalar CRUD and standard master-data scaffolding |

NuGet: `BqAtlas.Core`, `BqAtlas.AspNetCore`, `BqAtlas.Identity`, `BqAtlas.EntityFrameworkCore`, `BqAtlas.OData`, and `BqAtlas.Templates`.

Import `@bqatlas/ui/theme.css` and `@bqatlas/angular/styles.css` in a consumer stylesheet. PDF/document viewing additionally requires `pdfjs-dist`, imported through `@bqatlas/ui/documents`, and a configured PDF worker path. Basic CRUD consumers do not need PDF.js.

## Tests and packages

```sh
dotnet test backend/tests/BqAtlas.Tests
npm test --prefix frontend
node scripts/backend.mjs test:integration
node scripts/pack.mjs
node scripts/verify-packages.mjs
```

Integration tests require a PostgreSQL or SQL Server connection and create/drop a uniquely named `bqatlas_test_*` database. They refuse cleanup if the actual database does not match their generated name. The server login role used for these tests needs database creation rights; production application accounts do not.

For the complete generated starter workflow, run `node scripts/verify-starter-runtime.mjs` after packing. This launches the generated host, serves its Angular build, applies/reapplies migrations, exercises real local login and the Customer/Quote workflow, restarts it and cleans up its isolated database. See [STARTER-RUNTIME.md](docs/STARTER-RUNTIME.md).

For repeatable live Keycloak qualification after packing, run `node scripts/verify-keycloak-runtime.mjs`. It starts its own disposable provider, verifies admin/reader/unassigned login and direct API permissions, checks logout, and cleans up its private realm and test database. Docker and a configured test database server are required. See [KEYCLOAK-READER.md](docs/KEYCLOAK-READER.md).

For live generated-resource checks after packing, run `node scripts/verify-generated-resource.mjs`. It reads your local development connection (or explicit `BQATLAS_TEST_PROVIDER` / `BQATLAS_TEST_CONNECTION`), creates a uniquely named test database, exercises generated CRUD/OData and the actual frontend adapters, and deletes that database. See [GENERATED-RUNTIME.md](docs/GENERATED-RUNTIME.md).

Package output: `artifacts/npm/*.tgz` and `artifacts/nuget/*.nupkg`. The verification script installs the template into an isolated cache, generates a starter, restores only package references, builds/tests backend and frontend, and compiles a scaffolded module.

## Database and authentication choices

Set `Database__Provider=postgresql|sqlserver` and `ConnectionStrings__Application` in `.env`. SQL Server uses `Server=localhost,21433;Database=bqatlas;User Id=sa;Password=...;TrustServerCertificate=true` for local development. The optional `sqlserver` Compose profile requires an x64 environment and a `MSSQL_SA_PASSWORD`; it is not started by default on this ARM64 Mac. Database selection does not migrate existing data between engines.

Set `Authentication__Mode=oidc` plus `Authentication__Oidc__Authority`, `Authentication__Oidc__ClientId`, and `Authentication__Oidc__ClientSecret` for an external provider. Register frontend-origin callbacks `/signin-oidc` and `/signout-callback-oidc`. Map provider roles to application permission IDs in `appsettings.json`; Keycloak `realm_access.roles` and ordinary `role`/`roles` claims are supported. For a local HTTP provider only, set `Authentication__Oidc__RequireHttpsMetadata=false`. OIDC mode has no local-password fallback. OAuth2-only providers require a provider-specific identity adapter.

For the isolated Keycloak development profile:

```sh
node scripts/setup-keycloak.mjs
docker compose --profile oidc up -d keycloak
node scripts/backend.mjs run --keycloak
```

Use **http://127.0.0.1:4200** (or localhost if it resolves to this frontend); both callback origins are explicitly registered. The generated `.env.keycloak` contains the client secret and `KEYCLOAK_TEST_PASSWORD` for the `admin`, `reader`, and `unassigned` accounts. The last account has no application permissions. This explicit flag overrides only authentication settings; ordinary runs retain local Identity. Realm imports and credentials live in ignored private files. Existing realm state is preserved across restarts; running setup again does not rotate credentials. This profile is development-only and does not configure a production identity provider.

Production needs HTTPS, explicit provisioning/migrations, and persisted/shared ASP.NET data-protection keys when running more than one instance. Configure forwarded headers only for trusted proxies. Local change-password, reset and email-confirmation flows are available; see [LOCAL-ACCOUNTS.md](docs/LOCAL-ACCOUNTS.md). MFA/user administration UI remains an extension. Optional API-client bearer authentication is available through explicit issuer, audience and scope mappings; see [API-CLIENTS.md](docs/API-CLIENTS.md).

## Scaffold a module

For the complete host, migration, permissions and frontend integration, follow [Add an Inventory module](docs/MODULE-AUTHORING.md).

Generate typed CRUD from an explicit resource definition:

```sh
node frontend/projects/cli/bin/bqatlas.mjs generate crud \
  --spec resource-specs/inventory/product.resource.json --out ./inventory-module
```

This supports scalar field types, validation, explicit permissions, form/list defaults and generated backend/frontend tests. Use `--regenerate --dry-run` to preview safe updates, then `--regenerate` to update unchanged generated files while preserving custom rules. Relationships and alternate keys remain pending. See [RESOURCE-GENERATION.md](docs/RESOURCE-GENERATION.md).

The fixed master-data shortcut is also available:

```sh
node frontend/projects/cli/bin/bqatlas.mjs scaffold master-data \
  --module Purchasing --entity Supplier --plural Suppliers --out ./supplier-module
```

Add `--dry-run` to preview a deterministic JSON manifest without writing files. Generated output includes `bqatlas.generation.json` with source hashes and a runnable .NET test project covering baseline validation and resource metadata. The generated README explains explicit module registration, permission grants, and migrations. Initial generation refuses existing output, including during previews. Resource-spec regeneration is explicit and refuses modified generated source; it does not silently alter the application host or overwrite custom rules.

Public npm/NuGet publication is deferred. The project is MIT licensed; see [docs/SOURCE-NOTICE.md](docs/SOURCE-NOTICE.md) for source provenance.

Package installation and coordinated upgrade guidance: [docs/PACKAGES.md](docs/PACKAGES.md).

## License and repository

MIT licensed — see [LICENSE](LICENSE). The canonical repository is [binaryquest/bqAtlas](https://github.com/binaryquest/bqAtlas). npm and NuGet publication are deferred; use the local package workflow for this preview. Both database providers are verified in CI.
