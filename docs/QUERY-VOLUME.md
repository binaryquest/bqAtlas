# Query-volume qualification

A PostgreSQL integration run on 2026-09-26 seeded 10,000 synthetic customers into a new migrated `bqatlas_test_<UUID>` database. `ApiFixture` replaces the configured database name, asserts the exact generated name and deletes that database on disposal. The volume test additionally refuses a non-test database name or nonempty Customer table before inserting anything. The development sample database is not used.

A read-only database-catalog check after the run found zero remaining `bqatlas_test_%` databases.

Evidence: `artifacts/volume-1790397971747/measurements.json` and the accompanying TRX. Seed time was approximately 1.38 seconds. Requests use the real ASP.NET Core authentication/authorization/CSRF/REST/OData pipeline through TestServer, with a local Identity read-only account and a real PostgreSQL 18.4 service. This measures one local sequential run, including response reading; it does not measure network latency, concurrent load, a percentile distribution or browser rendering. The first request to a code path may include initialization costs.

| Request | Returned rows | Matched rows | Response bytes | Observed milliseconds |
| --- | ---: | ---: | ---: | ---: |
| REST page 0 | 25 | 10,000 | 4,405 | 44.5 |
| REST page 199 | 25 | 10,000 | 4,408 | 62.7 |
| REST page 399 | 25 | 10,000 | 4,411 | 63.9 |
| REST active-only, descending code | 25 | 5,000 | 4,397 | 15.4 |
| OData last page, skip 9,975 | 25 | 10,000 | 4,337 | 193.0 |
| Active customer lookup, selected search prefix | 20 | 500 | 2,306 | 33.7 |

Assertions check exact first/last record codes for first/middle/last REST pages, stable ascending ordering, descending active filtering, OData count/page agreement, lookup result count and active-only choices. A request for 10,000 rows is rejected with 400. Each measured response must remain below 16,000 bytes for these fixtures. That payload bound is a regression assertion for this dataset, not a universal response-size promise for arbitrary field content.

## Run

`node scripts/backend.mjs test:integration` runs `VolumeTests` along with the other isolated real-provider tests, using the repository development server settings. For a configured disposable test server, `dotnet test backend/tests/BqAtlas.IntegrationTests --filter FullyQualifiedName~VolumeTests --logger trx` uses `BQATLAS_TEST_PROVIDER` and `BQATLAS_TEST_CONNECTION`. The fixture still creates its own uniquely named database; its account needs permission to create/drop that test database. Never aim integration suites at a production server.

Optionally set `BQATLAS_VOLUME_REPORT` to an output JSON path whose parent directory exists. Measurements also appear in test output/TRX. The CI database matrix runs the test on each configured provider; SQL Server still needs an executed successful result before support is qualified.

## Limits still to measure

This proves bounded database/HTTP pages for this dataset. It does not establish a maximum number of retained browser tasks, rendered datasheet rows or concurrent users. Browser rendering, request cancellation under interaction, larger field content and application-specific query plans remain separate qualification. Do not infer arbitrary ERP scale from these figures.


The generated packaged REST list additionally has browser cancellation evidence in GENERATED-RUNTIME.md (`resource-runtime-1790402282913`). With controlled query delay, search replacement and task closure both cancelled server-observed requests. The inspected result page rendered 25 data rows while its footer reported 54 records over three pages. This small browser fixture is distinct from the 10,000-customer server measurement above; no combined 10,000-row browser performance claim is made.
