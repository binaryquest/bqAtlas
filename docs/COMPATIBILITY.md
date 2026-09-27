# Preview compatibility and qualification

This table describes the current local `0.1.0-alpha.1` preview. A dependency pin or successful build is not a claim of runtime support across every version allowed by a package range.

| Component | Repository configuration | Verified scope |
| --- | --- | --- |
| .NET | SDK 10.0.201, `latestFeature` roll-forward; `net10.0` | Source and installed-consumer builds/tests on this development host; later SDK feature bands are allowed but not independently qualified |
| ASP.NET Core / EF Core | Identity, OIDC, JWT and EF packages 10.0.10 | Local Identity and application APIs on PostgreSQL and SQL Server; isolated OIDC callback and external-cookie authorization tests |
| PostgreSQL | `postgres:18.4-trixie`; Npgsql EF provider 10.0.3 | Real migrations, Identity, CRUD/query/concurrency, quote transactions, generated resource parity and installed-starter runtime pass |
| SQL Server | `2022-latest` container configuration; EF provider 10.0.10 | Both authentication choices build; real-engine integration, migrations, local Identity, generated CRUD and installed starter runtime pass in CI. The container tag is mutable, so a release must record the exact tested server build/image identity |
| OData | Microsoft.AspNetCore.OData 9.5.0 | Bounded authorized DTO reads and actual packaged frontend adapter fixtures on PostgreSQL and SQL Server |
| Node | 24.15.0 in `.nvmrc`; minimum 24.15 in package engines | Library, CLI and clean-consumer builds/tests; other allowed Node versions are not independently qualified |
| Angular | Runtime packages 22.1.7; build/CLI 22.1.8; ng-packagr 22.1.1 | Source build/tests and all four generated database/auth frontend configurations |
| TypeScript | `~6.0.0` | Version resolved by the repository lockfile and tested consumers; no blanket TypeScript minor-version compatibility claim |
| Keycloak | Development image 26.7.0 | Live admin/reader login/logout and unassigned-user UI; synthetic negative protocol and direct authorization tests are separate evidence |
| Other identity providers | Standard configurable ASP.NET OIDC integration | No second live provider certified. OAuth2-only providers need an explicit identity handler/broker; opaque access-token introspection is not implemented |
| Browser | Codex in-app browser on this development host | Recorded Customer/quote/workspace/mobile workflows. No Chrome/Edge/Firefox/Safari support matrix or WCAG conformance claim yet |
| PDF documents | Optional `@bqatlas/ui/documents` peer | Basic consumers prove PDF.js is not installed; this does not qualify every document renderer or worker deployment |

## Current artifact evidence

The release manifest and all ten archive hashes were rechecked against these successful reports:

- `artifacts/verify-1790401436680/verification.json`: all four database/auth combinations build backend/frontend and pass 33 backend plus 37 frontend unit tests each; scaffold/regeneration checks also pass.
- `artifacts/starter-runtime-1790401436591/verification.json`: actual installed host and PostgreSQL migrations, local Identity, Customer/quote workflow, restart persistence and logout.
- `artifacts/resource-runtime-1790401436545/verification.json`: generated Product persistence and actual REST/OData adapter parity on PostgreSQL.

Source integration evidence is separate: the complete current PostgreSQL integration suite passes all 31 tests in `artifacts/integration-postgresql-current/postgresql.trx`, including the two external-authorization cases. This supersedes the earlier 29-test full run and overlapping 13-test authentication selection. Synthetic OIDC callback/external-cookie tests remain distinct from live Keycloak browser evidence.

## Gates that still prevent first-release completion

GitHub Linux x64 runners now provide the SQL Server test environment; both provider runtime jobs pass in [successful CI run for `34b279c`](https://github.com/binaryquest/bqAtlas/actions/runs/36248327026). Controlled browser timing, REST cancellation and successful quote keyboard workflows now have recorded evidence; remaining accessibility and browser coverage are tracked in ACCEPTANCE.md. Native dialog behavior could not be fully observed through the current browser tooling and remains unqualified.

The canonical public repository is https://github.com/binaryquest/bqAtlas and the source is MIT-licensed. npm/NuGet namespace ownership, release provenance and publication are deferred by the owner. The linked CI artifacts include MIT metadata and verified runtime reports. Rebuild and verify after subsequent source changes; historical local archives are not automatically refreshed.
