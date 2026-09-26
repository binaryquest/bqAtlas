# BqAtlas.OData

Bounded OData reads.

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

Read-query validation for explicitly projected public DTOs. Register only intended fields and enforce the same authorization as REST. Keep writes and business commands on versioned REST endpoints; do not expose EF entities or unrestricted IQueryable endpoints.

## Install from local artifacts

```sh
dotnet add package BqAtlas.OData --version 0.1.0-alpha.1 --no-restore
dotnet restore --source /absolute/path/to/artifacts/nuget --source https://api.nuget.org/v3/index.json
```

Target framework: `net10.0`. Keep bqAtlas package versions coordinated with the template. Configure a NuGet source for third-party dependencies as well as the local artifact feed when restoring a complete application. For executable configuration examples, generate an application using `BqAtlas.Templates` from the same artifact set.
