# Generated resource runtime qualification

Run `node scripts/pack.mjs`, then `node scripts/verify-generated-resource.mjs` with Node 24.15+ and .NET 10 available. The runner uses `.env` when present. Explicit `BQATLAS_TEST_PROVIDER` (`postgresql` or `sqlserver`) and `BQATLAS_TEST_CONNECTION` take priority over development settings. The database account must be allowed to create/drop a uniquely named test database.

The runner installs the actual CLI tarball, generates Product from its packaged specification, and restores framework NuGet packages from the local artifact directory into a private cache. It hashes the artifacts and refuses to report success if they change during the run. It also installs the actual Angular/UI/contracts tarballs for the frontend adapter test.

A dedicated loopback-only HTTP host exposes the generated resource module. Its cookie identities are synthetic test accounts with explicit writer/reader/denied permissions. They do not qualify local Identity or OIDC login: those have their own integration/browser checks. The fixture creates a database named `bqatlas_generated_<random UUID>`, verifies its connection target, and drops only that exact database during cleanup. No sample application records are used.

The four runtime scenarios cover:

- REST creation, loading, update, exact decimal/date fields, persisted audit actor, optimistic concurrency and deletion.
- Matching REST/OData typed filters and ordering, native date values, exact decimal-string JSON and exclusion of internal fields.
- The actual packaged `AtlasApi`, `RestResourceProvider` and `ODataResourceProvider` over real HTTP against the same fixtures: 53 rows, server-driven continuation, exact values beyond JavaScript numeric precision, GUID filtering, and delegated versioned writes/deletes.
- Permissions, manifest visibility, CSRF, malformed/invalid inputs and bounded REST/OData queries.

Node's test adapter supplies a browser-like cookie jar and relative-URL origin only; it does not mock provider methods, HTTP responses or database results. The regular Angular application is not rendered in this harness, so browser accessibility and view-switch qualification remain separate work.

The generated EF model creates its isolated schema using `EnsureCreated`. This verifies provider mapping/query/runtime behavior, not reviewed application migrations or multiple-module migration ordering. The broader sample integration suite covers the actual sample migration assemblies.

Reports are written under `artifacts/resource-runtime-*/`: `verification.json` names the provider and exact artifact hashes; `results/runtime.trx` contains test evidence. The PostgreSQL runtime has passed locally. The same runner is wired into both database CI matrix jobs, but this does not constitute an executed SQL Server qualification result. Initial local runs encountered intermittent connection timeouts; a subsequent complete packaged run passed all four scenarios.


## Optional browser review

`node scripts/verify-generated-resource.mjs --browser-review` also installs the packaged starter into a private template environment, adds the CLI-generated Product binding and builds a small review shell using the installed generic CRUD components. It serves the result from the loopback-only test host. The review shell offers REST/OData read adapters; both use the same generated list/editor feature and REST writes. It does not implement custom Product views.

After initialization and HTTP tests, the fixture writes `browser-review.json` with its local origin. Open the origin and use Enter as test writer. This deliberately issues a synthetic test cookie; it is not local Identity or OIDC qualification. The endpoint exists only in this optional test harness and is never included in a product package. The server binds 127.0.0.1 and owns a fresh `bqatlas_generated_<UUID>` database.

Create `browser-review.json.done` after closing the review browser to release cleanup. The hold expires after 40 minutes, removes the review file and drops only the exact generated database. Failed database initialization skips the hold. EF mapping uses EnsureCreated, so this does not qualify generated migrations.

### Browser evidence, 2026-09-26

Run `resource-runtime-1790398759901` rendered 25 data rows from 54 generated test records across three pages. A new Product used only the generated metadata feature and packaged generic editor. Empty Category, Unit price `1.00001` and Reorder level `1.5` were rejected together. Each invalid control exposed aria-invalid and a resolving error reference; Category received focus. The decimal native input exposed required state.

Corrected values (Service, `12.3456`, integer `7`) saved with Ctrl+S and acquired a record ID/version. Switching the review shell to OData reads and filtering SKU found that same record with the exact price. Opening it, changing the price to `23.4567`, and choosing Save & close persisted the change, closed only the editor and refreshed the filtered OData list. Browser create/read/update are verified; delete remains covered by the HTTP suite, not this browser review.

The first attempt (`resource-runtime-1790398656809`) failed during initial Npgsql connection with a timeout before feature assertions. That process was released and exited before retry. A guard was added so failed initialization cannot advertise a usable browser review. The successful retry uses a fresh isolated database; no development sample records were modified.


### Controlled write latency in browser review

The optional loopback browser-review host provides authenticated Enable/Disable 10s write delay links. A private review cookie opts that browser into a ten-second server-side delay for Product create/update/delete; reads and the ordinary HTTP suite remain unaffected. The middleware and routes exist only when `BQATLAS_RESOURCE_REVIEW` is set in the temporary harness. They are not included in product packages or the generated application's host. Delay cancellation observes the request abort token.

Review `resource-runtime-1790401873893` uses the current packaged CLI/UI/framework artifacts. With the delay enabled, a normal save of an existing disposable Product was started, then a second new draft was activated. While the first save was pending its Save action was disabled. After completion the first task showed Saved, while the second remained active with SKU `KEEP-UNSAVED` and unsaved state.

A second change to the original record used Close window → Save & close. During the delayed response the dialog displayed Saving and the original task remained present. On completion, only that record task closed; its originating list became active. The unrelated new draft remained open with its unsaved SKU. The list displayed the persisted description `Delayed save and close`. The unrelated draft was then discarded, delay disabled, and the temporary tab closed. The completion marker released the host; all four runtime tests passed and the review file was removed. Its report hashes match the current ten archives.

This establishes delayed completion ownership and waiting behavior for the generic packaged CRUD view in this browser. Cross-session disposal is covered separately by controlled workspace tests; it was not repeated through a real provider logout in this review.


### Browser query cancellation

The optional review harness also exposes authenticated Enable/Disable 10s query delay links. For the opted-in browser, Product REST queries await a cancellation-aware ten-second delay. `/test/query-stats` exposes only anonymous aggregate started/cancelled/completed counters in this loopback review host; no records, claims or credentials are returned. Production artifacts do not include these endpoints.

On the current package set, `resource-runtime-1790402282913` verified a changed search while an earlier query was pending. After the initial exploratory queries, counters were 2 started / 1 cancelled / 1 completed. A `MISSING-OLD` search was replaced after Loading appeared with `O'Brien`; counters became 4 / 2 / 2. The final input remained `O'Brien`, the rows contained the matching Product descriptions, and the browser rendered 25 data rows while reporting 54 records across three pages. A subsequent `CLOSE-PENDING` query was cancelled by closing the Products task: counters became 5 / 3 / 2 and the task count was zero. No late result recreated the closed task during observation.

This is real browser AbortController/request-abort evidence for the packaged generic REST list, complementing controlled latest-response tests. It does not establish cancellation latency under every network or database workload, OData cancellation, or arbitrary row/task scale. The delay was disabled, tab closed and hold released. All four runtime tests passed, the process completed and the review file was removed; artifact hashes match the release manifest.
