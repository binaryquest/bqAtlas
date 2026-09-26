# BqAtlas.Identity

Local ASP.NET Core Identity.

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

Local account storage, sign-in/sign-out, password change, password reset and email confirmation. Configure an EF Core provider and application email sender. The development outbox is opt-in and must not be used as production mail delivery. Local Identity is not an OAuth/OIDC authorization server.

## Install from local artifacts

```sh
dotnet add package BqAtlas.Identity --version 0.1.0-alpha.1 --no-restore
dotnet restore --source /absolute/path/to/artifacts/nuget --source https://api.nuget.org/v3/index.json
```

Target framework: `net10.0`. Keep bqAtlas package versions coordinated with the template. Configure a NuGet source for third-party dependencies as well as the local artifact feed when restoring a complete application. For executable configuration examples, generate an application using `BqAtlas.Templates` from the same artifact set.
