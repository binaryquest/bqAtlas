# BqAtlas.Templates

Full-stack ERP starter.

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

A modular ASP.NET Core 10 host and Angular Atlas workspace, CRM Customers, Sales Quotes, database migrations and basic unit tests. Choose PostgreSQL or SQL Server and local Identity or external OIDC.

## Install and generate locally

```sh
dotnet new install /absolute/path/to/artifacts/nuget/BqAtlas.Templates.0.1.0-alpha.1.nupkg
dotnet new bqatlas -n MyErp --database postgresql --auth local
```

Supported template options: `--database postgresql|sqlserver` and `--auth local|oidc`. Follow the generated README to configure local NuGet/npm artifact sources, database connection, migrations and development credentials. Requires .NET SDK 10.0.201+ and Node 24.15+. The frontend uses Angular 22.

Run `dotnet test tests/Unit` and `npm test --prefix client` without a database. Real database integration and external-provider checks are separate. PostgreSQL runtime has local qualification; SQL Server migrations/builds are available but runtime qualification is still pending.
