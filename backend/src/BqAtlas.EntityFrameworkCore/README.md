# BqAtlas.EntityFrameworkCore

EF Core persistence conventions.

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

Versioned entity and concurrency helpers for module-owned persistence. Configure the application database provider and provider-specific migrations in the host; migrations are an explicit deployment operation.

## Install from local artifacts

```sh
dotnet add package BqAtlas.EntityFrameworkCore --version 0.1.0-alpha.1 --no-restore
dotnet restore --source /absolute/path/to/artifacts/nuget --source https://api.nuget.org/v3/index.json
```

Target framework: `net10.0`. Keep bqAtlas package versions coordinated with the template. Configure a NuGet source for third-party dependencies as well as the local artifact feed when restoring a complete application. For executable configuration examples, generate an application using `BqAtlas.Templates` from the same artifact set.
