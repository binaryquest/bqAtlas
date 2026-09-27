# Add a generated Inventory module

This walkthrough adds Product CRUD to a generated starter without a custom list or record component. It covers the application composition that the generator deliberately leaves under your control: references, services, endpoints, permissions, database migrations and frontend registration.

Start with an application generated as **AcmeErp**, using the [local-package quickstart](STARTER-QUICKSTART.md). For another application name, substitute its namespace/solution name for `AcmeErp` below. Keep a configured local NuGet source and the absolute `BQATLAS_ARTIFACTS` path from that guide. All commands below run from the application root. Commit your starting application before editing it.

## 1. Generate and retain ownership metadata

```sh
npm install --save-dev "$BQATLAS_ARTIFACTS/npm/bqatlas-cli-0.1.0-alpha.1.tgz"
npx --no-install bqatlas generate crud --spec resource-specs/inventory/product.resource.json --out features/inventory
```

Keep the complete output together in `features/inventory`, including its specification, generation manifest, backend tests and user-owned `ProductRules.Custom.cs`. Referencing the generated backend in place allows later regeneration to check the original files. Its namespace is `App.Modules.Inventory`; it does not inherit the application's root namespace.

## 2. Reference the module from the host and migration projects

```sh
dotnet add server/Host/Host.csproj reference features/inventory/server/Modules/Inventory/Inventory.csproj
dotnet add server/Migrations/PostgreSql/PostgreSql.csproj reference features/inventory/server/Modules/Inventory/Inventory.csproj
dotnet add server/Migrations/SqlServer/SqlServer.csproj reference features/inventory/server/Modules/Inventory/Inventory.csproj
```

The host composes the module; each migration assembly must also see its DbContext. Avoid references from unrelated business modules into the Inventory implementation. If another module needs Inventory behavior, introduce a narrow public contract, following CRM's separate contracts project.

## 3. Register services, metadata and endpoints

In `server/Host/Program.cs`, add:

```csharp
using App.Modules.Inventory;
```

Before `builder.Services.AddBqAtlasHttp(registry)` and `registry.Configure(...)`, add:

```csharp
registry.AddModule(new InventoryModule(options => ConfigureDatabase(options, "inventory")));
registry.AddResource(InventoryModule.Resource);
```

`ConfigureDatabase` already selects the application's provider and migration assembly. Passing `inventory` gives this DbContext its own migration-history schema. The existing `registry.Map(app)` call maps the module's REST CRUD/query/lookup endpoints.

Extend the existing controller/OData registration to include the new controller assembly and read model:

```csharp
builder.Services.AddControllers()
    .AddApplicationPart(typeof(CustomersController).Assembly)
    .AddApplicationPart(typeof(ProductsController).Assembly)
    .AddOData(options => options.Select().Filter().OrderBy().Count().SetMaxTop(100)
        .AddRouteComponents("odata/v1/crm", CrmModule.ReadModel())
        .AddRouteComponents("odata/v1/inventory", InventoryModule.ReadModel()));
```

Inside the existing `--migrate` block, alongside CRM and Sales, add:

```csharp
await scope.ServiceProvider.GetRequiredService<InventoryDbContext>().Database.MigrateAsync();
```

Do not apply migrations during ordinary startup. New modules should own their schema, validation and application operations; the host remains the composition point.

## 4. Grant permissions explicitly

In **both** calls to `BootstrapDevelopmentUserAsync` and `GrantDevelopmentPermissionsAsync`, extend the permissions argument to:

```csharp
CrmPermissions.All.Concat(SalesPermissions.All).Concat(InventoryPermissions.All)
```

This is an explicit grant to the development account. Existing accounts are not silently elevated by startup. After starting with an existing development account, run `node scripts/backend.mjs grant-dev`, then sign out and back in to refresh its cookie. Production user provisioning remains your application's responsibility.

For OIDC, append these values to the existing `Authentication.RolePermissions.bqatlas-admin` array in `server/Host/appsettings.json`:

```json
"inventory.products.read",
"inventory.products.write",
"inventory.products.delete",
"inventory.products.lookup"
```

Append only `inventory.products.read` and `inventory.products.lookup` to `bqatlas-reader`. Preserve the existing CRM/Sales permissions. Authentication does not itself grant application permissions, and hiding a menu is not authorization: generated endpoints independently enforce the declared permissions.

## 5. Create both migration sets

Create `server/Migrations/PostgreSql/InventoryDbContextFactory.cs`:

```csharp
using App.Modules.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace AcmeErp.Migrations.PostgreSql;

public sealed class InventoryDbContextFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<InventoryDbContext>()
            .UseNpgsql("Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only",
                o => o.MigrationsAssembly(typeof(InventoryDbContextFactory).Assembly.FullName)
                    .MigrationsHistoryTable("__EFMigrationsHistory", "inventory")).Options);
}
```

Create `server/Migrations/SqlServer/InventoryDbContextFactory.cs`:

```csharp
using App.Modules.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace AcmeErp.Migrations.SqlServer;

public sealed class InventoryDbContextFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<InventoryDbContext>()
            .UseSqlServer("Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true",
                o => o.MigrationsAssembly(typeof(InventoryDbContextFactory).Assembly.FullName)
                    .MigrationsHistoryTable("__EFMigrationsHistory", "inventory")).Options);
}
```

These design-time connection strings are placeholders; generating a migration does not connect to them. Runtime migration uses the host's configured connection instead.

Restore the new project references **before** EF discovers project metadata:

```sh
dotnet restore AcmeErp.slnx
dotnet tool restore --tool-manifest dotnet-tools.json
dotnet ef migrations add InitialInventory --context InventoryDbContext --project server/Migrations/PostgreSql --startup-project server/Migrations/PostgreSql --output-dir Inventory
dotnet ef migrations add InitialInventory --context InventoryDbContext --project server/Migrations/SqlServer --startup-project server/Migrations/SqlServer --output-dir Inventory
```

Review and commit both migration sets and snapshots. Then, with your selected database running:

```sh
node scripts/backend.mjs migrate
```

Migration source is application-owned. Regenerating CRUD files does not create or apply migrations. Do not use the design-time placeholder credentials for `database update`.

## 6. Register the frontend feature and menu

Copy `features/inventory/client/feature.ts` to `client/projects/erp/src/inventory-feature.ts`. Keeping the binding inside the Angular application lets it resolve that application's installed peers. Recopy it after regeneration; keep customizations in separate application files.

Add to `client/projects/erp/src/main.ts`:

```ts
import { feature as inventoryFeature, menu as inventoryMenu } from './inventory-feature';
```

Add `inventoryFeature` to the existing `this.crud.register(...)` call and `inventoryMenu` to `this.menus.register(...)`. Retain the existing CRM/Sales entries. The generic views use the server descriptor, generated defaults/list columns, and current permissions. Products now appears on home and in Start for authorized accounts.

For a custom field, compose a feature with `fieldRenderers` and `fieldValidators`; see [FIELD-EXTENSIONS.md](FIELD-EXTENSIONS.md). For a custom aggregate view, follow `client/projects/erp/src/sales/quote-views.ts`: register ordinary Angular view components with the same task/session/provider lifecycle. Avoid changing framework internals for application-specific behavior.

## 7. Build and exercise the module

```sh
dotnet test features/inventory/tests/Inventory.Tests
npm install --prefix features/inventory/client "$BQATLAS_ARTIFACTS/npm/bqatlas-contracts-0.1.0-alpha.1.tgz" "$BQATLAS_ARTIFACTS/npm/bqatlas-ui-0.1.0-alpha.1.tgz" "$BQATLAS_ARTIFACTS/npm/bqatlas-angular-0.1.0-alpha.1.tgz"
npm test --prefix features/inventory/client
dotnet build AcmeErp.slnx
npm run build --prefix client
```

Start the backend/frontend using the quickstart, sign in, and open Products. Create a product, validate required/enum/decimal fields, save, reopen and update it. New fields flow through the generic views. Server errors and stale versions retain the draft. REST decimals remain strings; OData consumers should request IEEE754-compatible JSON when exact decimal values matter.

The generated unit tests use in-process persistence; verify real providers separately. In the **framework repository**, `node scripts/verify-module-walkthrough.mjs` executes this composition against installed packages, generates both migration sets, builds the registered frontend, runs generated unit tests, and tests actual migrations/local login/CRUD/OData/restart persistence in a disposable database. It uses `.env` or `BQATLAS_TEST_PROVIDER` / `BQATLAS_TEST_CONNECTION`; `BQATLAS_ARTIFACT_ROOT` can select another checkout's artifacts. Add `--browser-review` for an isolated manual UI review before cleanup. Both database CI jobs run it.

## 8. Extend safely

Add business rules in `features/inventory/server/Modules/Inventory/ProductRules.Custom.cs`. Edit the retained `resource.json`, then use the [regeneration workflow](RESOURCE-GENERATION.md) to preview and update unchanged generated files. Copy the refreshed frontend binding, review/generate provider migrations for schema changes, rebuild and run tests. Review permission changes separately; regeneration does not grant new capabilities to users.

This scalar-resource example does not generate relationships, aggregate transactions or alternate-key constraints. Those are application code, as demonstrated by Sales quotes, and require their own validation and transaction tests.
