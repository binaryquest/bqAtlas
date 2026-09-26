# Local packages and coordinated upgrades

The current release is an unpublished `0.1.0-alpha.1` preview. Four npm tarballs, five framework NuGet packages and one template NuGet package are built into `artifacts/`. The source is MIT-licensed at https://github.com/binaryquest/bqAtlas. Registry ownership, publication and release provenance are deferred. Existing archives predate this metadata; rebuild before distributing them. `SOURCE-NOTICE.md` records the origin of reused source; it is not a distribution license.

## Build and verify

```sh
node scripts/pack.mjs
node scripts/verify-packages.mjs
```

Packing builds Angular libraries, copies the current sample into the starter template, packs every artifact, checks each archive's README/source notice and writes `artifacts/release-manifest.json`. Verification installs into an isolated template engine and restores actual package dependencies into a private cache, then runs the generated build/test matrix. Each of the four database/auth combinations receives its own generated frontend install, production build and unit-test run as well as backend build/unit tests. The report records these checks per combination. CI retains the release manifest and consumer verification reports separately from the package files. This matrix does not start a database or certify a live OIDC provider; runtime qualification is separate. Use Node 24.15+ and .NET SDK 10.0.201+. Follow the repository quickstart for installing dependencies first.

## Consume locally

For an existing .NET project, add the required framework reference without resolving packages immediately, then restore using both feeds:

```sh
dotnet add package BqAtlas.AspNetCore --version 0.1.0-alpha.1 --no-restore
dotnet restore --source /absolute/path/to/artifacts/nuget --source https://api.nuget.org/v3/index.json
```

For an Angular consumer, install the matching contracts, UI and Angular integration tarballs together. Install the CLI when generation is needed. Supplying all local bqAtlas peers avoids requesting unpublished dependencies from npm.

```sh
npm install /absolute/path/to/artifacts/npm/bqatlas-contracts-0.1.0-alpha.1.tgz /absolute/path/to/artifacts/npm/bqatlas-ui-0.1.0-alpha.1.tgz /absolute/path/to/artifacts/npm/bqatlas-angular-0.1.0-alpha.1.tgz
```

Use the package READMEs for style imports and optional peers. The basic starter does not require PDF.js. To generate a full application, install the local `BqAtlas.Templates.0.1.0-alpha.1.nupkg` with `dotnet new install`, run `dotnet new bqatlas`, and follow its generated README. Template options are `--database postgresql|sqlserver` and `--auth local|oidc`.

## Upgrade an application

1. Retain the application's current lockfiles and package versions in version control. Read release notes and compare HTTP/metadata contract versions before changing dependencies.
2. Obtain one complete, qualified release set. Match the artifact hashes to its verification reports; a build with the same version text is not proof of identical bytes. Hash verification identifies bytes, not publisher trust.
3. Update bqAtlas npm packages and NuGet references together using the coordinated version. Keep third-party peers inside each package's declared compatibility range. Restore and run application unit tests and production frontend/backend builds.
4. Generate a separate starter with the new template to compare host configuration, migrations and module registration. Installing a template never upgrades an existing application's source automatically. Review and port relevant changes explicitly.
5. For scaffolded resources, preview regeneration and inspect ownership/conflict reports. Preserve custom partials. Regeneration does not apply database migrations; create and review provider-specific migration changes separately.
6. Test against the application's real database and configured identity provider, including permissions, stale writes, logout/session expiry, quote calculations and any custom controls. Apply approved migrations through the application's deployment procedure.

Published versions must never be overwritten. This local unpublished preview is rebuilt during development, so a fresh private package cache or a new version is required when testing changed bytes with the same prerelease number. The repository's consumer verifier creates private caches automatically. Do not solve application upgrade problems by blindly clearing unrelated global caches or replacing data directories.

Before public publication, configure registry ownership, repository metadata, distribution license/notices and registry-appropriate provenance. Test installation from the target registries after publishing the complete coordinated set; local artifact tests do not prove public installation.
