# Implementation status

## Current qualification

The [successful CI run for `34b279c`](https://github.com/binaryquest/bqAtlas/actions/runs/36248327026) verifies source tests, all four package-consumer configurations and real PostgreSQL/SQL Server integration, generated CRUD and installed-starter runtime. The timestamp correction includes five regression cases (38 backend unit tests total). Package publishing remains deferred.

The forms-and-controls showcase is now integrated into the sample home and Start menu and generated starters. A clean source walkthrough verified setup preservation, migrations, first login, singleton launch, local sample save/dirty-close and form interaction. See STARTER-QUICKSTART.md and SHOWCASE.md.

UI follow-up: the source starter now uses one taskbar with a bqAtlas Start launcher; account identity appears as a clickable avatar section that opens a User account dialog. Local password change is inside that dialog; sign-out remains in Start. External accounts see identity-provider guidance. Close all windows is in the same menu. The separate header is removed. Production build and 99 existing frontend tests pass; browser review verifies menu keyboard navigation, opening Customers and closing all clean windows. Historical local reports below predate this layout change; the linked CI run includes it.

The complete current source integration suite passes all 31 tests on PostgreSQL (`artifacts/integration-postgresql-current/postgresql.trx`), including the added external-role authorization checks. This is a separate source result from the packaged-consumer evidence below.

The local `0.1.0-alpha.1` package set contains four npm and six NuGet archives. All four generated database/auth combinations pass backend and frontend builds, 33 backend unit tests and 37 frontend unit tests each (`verify-1790401436680`). The installed PostgreSQL starter and generated Product runtime have matching-hash successful reports (`starter-runtime-1790401436591` and `resource-runtime-1790401436545`). See COMPATIBILITY.md for dependency pins and exact evidence limits.

Browser evidence now includes simultaneous retained drafts, stale-save retention/reload, controlled delayed save-and-close, REST query cancellation, mobile layout, field/error semantics, local and Keycloak login, and a successful keyboard quote save/submission. These checks do not establish a broad browser support matrix or full accessibility conformance. WORKSPACE-BROWSER.md and ACCESSIBILITY.md distinguish source checks from installed-package checks.

The failed cleanup after the latest keyboard review was reconciled by identifying and deleting its exact disposable database. The revised harness preserves credential-free database lifecycle evidence and passed a fresh installed-consumer PostgreSQL workflow with automatic deletion (`starter-lifecycle-check/results/lifecycle.trx`). Package bytes were unchanged.

The release remains incomplete: remaining browser/provider qualification is tracked in ACCEPTANCE.md; the canonical public repository is binaryquest/bqAtlas and MIT licensing is confirmed. npm/NuGet ownership, publication and registry installation checks are deferred by the owner. No packages have been published.

## Historical first increment

Validation snapshot: 33 backend unit tests, 11 PostgreSQL HTTP integration tests, and 66 frontend/scaffolding tests pass. Concurrent submit coverage repeats paired requests across twelve independent quotes. Updated npm/NuGet artifacts build. Fresh starter verification passes backend/frontend builds, 32 backend and 7 frontend tests, and generated Supplier compilation (`artifacts/verify-1790389241570/verification.json`).

- New repository, package boundaries and independent sample; no bqStart application/configuration copied.
- .NET 10 solution compiles with warnings treated as errors.
- Backend unit tests: module ordering/cycles/missing dependencies, permissions, query limits, validation and concurrency.
- HTTP integration tests on PostgreSQL 18: login/CSRF, anonymous 401, permission 403, filtered manifest, CRUD/search/validation, required/stale ETags, bounded OData and logout.
- Angular production build and inherited Atlas regression tests, editor isolation/session cleanup, and scaffolder input/overwrite tests.
- Browser verification: sign in, open customer list/editor, create a persisted customer, list refresh and clean saved state.
- Provider-specific SQL Server migrations compile. SQL Server has not been runtime-tested on this ARM64 host.
- npm and NuGet artifacts, generated starter and generated supplier module package-consumption checks.

## How to read the history

The sections below describe successive implementation increments. Their test counts and then-pending work are historical snapshots, not the current release state. Use the current summary above, ACCEPTANCE.md and COMPATIBILITY.md for qualification. Rust remains a future implementation of the portable HTTP contracts; full multi-tenant isolation and ERP business modules are outside this release.

## Design choices in the first increment

The API exposes stable resource IDs, typed JSON contracts and opaque concurrency tokens. Domain modules do not reference Identity users. Sales resolves customers through the CRM public directory contract; an assembly dependency test prevents references to the CRM implementation or Identity. Queryable state remains server-side; OData receives an explicitly projected DTO, not an EF entity.

The browser uses a same-origin, HttpOnly cookie in both authentication modes and CSRF tokens on state-changing requests. No access/refresh token is stored in browser storage. Local Identity is not presented as an OAuth/OIDC server.

The reusable generic CRUD renderer supports string, email, boolean, safe integer, date-only, enum and non-negative exact-decimal fields. Custom registered Sales views additionally use typed remote reference lookup, date, enum and exact decimal inputs. Its typed contracts describe additional semantic field types for later renderers; unsupported types must not be treated as fully implemented.

## Sales increment

Quotes own their header, line set, audit operations and submission keys in the Sales schema. Draft updates use ETags, and submitted quotes are immutable. Submit retries are scoped to quote, authenticated actor and UUID key. The replay check is repeated when a concurrent commit changes the version between reads.

Money uses canonical decimal strings over HTTP, .NET decimal arithmetic on the server and BigInt for client previews. Shared fixtures cover line-level midpoint rounding and totals beyond JavaScript's safe integer range. These fixtures and the quote write schema ship with the contracts package and starter.

Existing development bootstrap accounts receive newly added module permissions only through the explicit `node scripts/backend.mjs grant-dev` command, followed by signing in again. Normal startup never elevates existing users.

## Keycloak development profile

An isolated Compose service on localhost port 28080 imports a generated bqatlas realm, confidential client with PKCE, and admin/reader/unassigned accounts. Setup writes private credentials without overwriting existing settings. OIDC discovery has been checked against the running Keycloak 26.7.0 container; browser admin login, CRM/Sales role mapping, provider logout/return, fresh-login prompt after logout, and the unassigned account empty workspace have now been verified. Negative token validation, reader workflow and session expiry remain open.

The profile uses the documented [Keycloak startup import](https://www.keycloak.org/server/importExport) and [container](https://www.keycloak.org/server/containers) mechanisms. Realm roles are explicitly included in the ID token for the application's server-side permission mapping.

Browser acceptance found and fixed two OIDC integration defects: default claim actions removed the issuer needed for provider-qualified actor IDs, and logout without retained tokens omitted the client identifier. A regression test now exercises issuer preservation through claim actions and the token-free logout message. Generated realm role names match the application's bqatlas-admin/bqatlas-reader mapping. Explicit localhost and 127.0.0.1 callbacks avoid ambiguity with other local servers. Package artifacts need rebuilding after these authentication fixes.

## OData frontend provider

The Angular package now exports an ODataResourceProvider and CRUD feature provider factories. Queries use an explicit EDM field map, typed literals, stable sorting, exact counts and bounded same-resource continuations. Writes delegate to the REST resource provider. Four regression tests cover escaping, literal validation, continuation boundaries and concurrency-token delegation. See [ODATA-PROVIDER.md](ODATA-PROVIDER.md). Live adapter acceptance and package consumer verification after this addition remain open.

## OData endpoint and artifact alignment

The PostgreSQL HTTP suite now exercises the frontend provider's OData query shape: inline count, bounded page, stable sorting, typed equality and escaped apostrophe search. This found and resolved a server count restriction incompatible with the new adapter. All 11 integration tests pass. Browser adapter acceptance remains separate from this protocol check.

Packaging emits `artifacts/release-manifest.json` with SHA-256 identities for the four npm and six NuGet artifacts. Consumer verification now snapshots these identities and rejects artifact changes during a verification run. Hashes identify tested bytes; they are not registry provenance or a public-release approval.

## Scaffolding preview and baseline tests

The master-data CLI now supports `--dry-run`, a deterministic `bqatlas.generation.json` source-hash manifest, and generated .NET validation/metadata tests. CLI tests prove dry-run leaves the destination absent, repeated previews agree, output hashes match and existing output remains untouched. The generated Purchasing test project compiles against the verified local framework packages and passes all three tests. Full arbitrary resource schemas, extension ownership and safe regeneration remain open; these additions do not imply those capabilities. Package verification now includes running the generated module tests. Repackaging the updated CLI remains required.

## Generic semantic editor fields

Field metadata now optionally carries decimal scale and maximum text values. Generic CRUD renders enum choices, date-only inputs, integer controls and string-valued decimal controls. Pre-submit validation rejects invalid calendar dates, unsafe/fractional integers, unknown enum choices and malformed/out-of-range decimals without converting money to Number. Writes include only declared editable fields. Read-only values render without editable controls.

Generic editors also honor returned edit/delete capabilities in addition to session permissions. Reference and date-time fields explicitly require a custom editor; remote references remain available through the typed lookup component used by Sales. Signed decimals and generic reference configuration are not yet covered by this renderer. All 60 frontend/scaffolding and 33 backend unit tests pass; library compilation succeeds. Browser field acceptance and refreshed packages remain open.

## Explicit application menus

The Angular package now provides AtlasMenus and a recursive AtlasMenu component. Registered nodes support nested groups, order, translation keys, resource targets and permission-bound asynchronous commands. Empty groups disappear, registration rejects duplicate IDs, and activation rechecks current visibility. The sample explicitly registers CRM and Sales groups. Three new tests cover filtering/order, duplicate/cyclic definitions and activation after permissions change. All 66 frontend/scaffolding tests and the production sample build pass. See [MENUS.md](MENUS.md). Browser menu acceptance, deep links and workspace navigation guards remain open.

## Workspace exit lifecycle

WorkspaceService.requestCloseAll closes a snapshot sequentially through the existing save/discard/cancel dialog. Clean tasks close immediately; failed saves retain their draft and pause the sequence, cancellation leaves remaining tasks open, and tasks opened during the operation remain outside its snapshot. Active saves prevent starting close-all. Session disposal clears the pending sequence. The starter exposes Close all in its header.

AtlasWorkspace now handles beforeunload when any task is dirty or saving. Browsers control the confirmation text and may require prior user interaction; this does not provide browser-history routing or recovery after a crash. Three lifecycle tests cover sequencing, save failures, snapshot isolation and the exit event handler. All 66 frontend/scaffolding tests and the production starter build pass. Native browser dialog acceptance and deep-link/Back integration remain open.

## Refreshed package matrix

`artifacts/verify-1790390666203/verification.json` records successful local-artifact consumption with SHA-256 package identities. Generated PostgreSQL/local, PostgreSQL/OIDC, SQL Server/local and SQL Server/OIDC backend configurations all build and pass 33 unit tests. The primary packaged frontend builds and passes its seven tests; generated Supplier builds and passes its three baseline tests. Both OIDC starters generate matching private Keycloak realm/client configuration. These are configuration/build checks, not SQL Server runtime qualification.

The generated quote test suite rejected a deliberate change from AwayFromZero to ToZero rounding. Source was restored in a finally block and the restored quote tests passed; evidence is in the same directory's mutation-verification.json. The tracked source was never mutated by this check. The current requirements audit is [ACCEPTANCE.md](ACCEPTANCE.md).

## Custom field extension points

CrudFeature now registers field components and synchronous business validators by field name. Renderer context contains isolated snapshots, unique IDs, errors and a guarded change callback. The Customer sample uses an application-owned code renderer and matching format validation. The production app builds and the 68-test suite passed; an additional targeted callback regression passed after adding coverage for readonly, permission/save-state guards and copied values. Browser renderer acceptance and updated artifact consumption remain open. See [FIELD-EXTENSIONS.md](FIELD-EXTENSIONS.md).

## Browser workflow acceptance

With the real Keycloak admin session, nested CRM/Sales menus render and open views. The remote customer lookup returned the existing development customer. A new quote with lines `2.125 × 12.3456` and `1 × 0.005` displayed 26.23 and 0.01, saved a 26.24 total, refreshed the list, and became read-only after Submit. The persisted development acceptance quote is `c15f5d0c-0e90-47f8-8271-b73f6e0e89f7`; no existing customer was edited.

The application-owned Customer code renderer displays its help text and validation. An invalid `bad/code` draft remained intact after failed save. Close all prompted; Keep editing preserved values; a subsequent Discard closed only the unsaved test draft and remaining clean tasks. Browser testing found that validation did not focus the invalid input; the focus-after-render fix now compiles and browser acceptance confirms the invalid Code control receives focus. This does not replace the still-open multiple-editor, keyboard/mobile and SQL Server scenarios.

## Optional bearer API clients

The host can opt into JWT access tokens on /api and /odata while preserving its selected browser cookie scheme on /auth. Issuer/audience/signature/lifetime and subject are required. API scopes map explicitly to application permissions; arbitrary permission claims are discarded. Invalid Authorization headers do not fall back to cookies. CSRF exemption requires successful bearer authentication on API paths; cookies and account routes retain CSRF checks.

All 12 integration tests pass, including the actual authentication/authorization/CSRF middleware pipeline with locally signed valid, wrong-issuer, wrong-audience, expired, missing-subject and wrong-key tokens; unmapped scopes; valid-cookie/invalid-token requests; and account-route isolation. Provider-specific token issuance is not covered by the local issuer fixture. See [API-CLIENTS.md](API-CLIENTS.md). Browser OIDC negative-token tests and refreshed package consumers remain separate pending work.

## Generated security and frontend tests

Master-data scaffolds now include a TestServer test that maps the generated module's actual REST endpoints. Anonymous reads return 401; an authenticated account with no resource permissions receives 403 for read/create/update/delete/query/lookup. The persistence callback throws if reached, proving authorization stops these requests before database access. The generated Inventory module passes all four baseline tests. Generation preview/hash and overwrite tests also pass.

The starter template now ships semantic field/custom-validation, nested-menu permission and workspace-exit regression tests alongside its quote/draft tests. They import installed package entry points rather than monorepo output paths. Fresh artifact consumption passes: artifacts/verify-1790391599473/verification.json records all four generated backend configurations passing 33 tests, the packaged frontend passing 19 tests, and generated Supplier passing four tests. The run caught and fixed a template substitution collision with BqAtlasAuthentication; delimited placeholder tokens now preserve framework identifiers.

## Deep links and retained browser navigation

AtlasNavigation now maps home, resource lists and saved records to hash URLs, and reactivates unsaved draft IDs only within their existing workspace. Link resolution uses registered resources and current permissions. Browser Back/Forward switches retained tasks without discarding them. Incoming routes can survive an external-login redirect through route-only session storage; that external-login return case remains unverified.

Browser acceptance confirms Customer list/record URLs, Back returning to the retained list, Forward returning to the same record task, and page reload reopening the saved record. Home links are canonicalized with replaceState to avoid consuming forward history. All 71 frontend/scaffolding tests pass. Navigation tests now ship in the starter; refreshed package consumption and mobile/native exit acceptance remain open. See [NAVIGATION.md](NAVIGATION.md).

## Local password change

The optional Identity module now exposes authenticated, CSRF-protected and rate-limited password change through UserManager.ChangePasswordAsync. It verifies the current password, applies Identity policy, updates the security stamp and signs out this browser. Other sessions follow Identity's configured validation interval. The reusable local-mode form blocks changes while workspace drafts are dirty/saving and clears entered passwords after each submitted request.

All 13 backend integration tests and 73 frontend/scaffolding tests pass; the production application builds. The new PostgreSQL test covers anonymous/CSRF denial, current-password and password-policy errors, sign-out and old/new password behavior. Frontend tests cover failure cleanup and successful session clearing. Reset/confirmation flows remain required work. Export work was not started in this increment; local account flows were prioritized from the explicit acceptance specification. See [LOCAL-ACCOUNTS.md](LOCAL-ACCOUNTS.md).


### Local recovery and confirmation

Implemented optional development email outbox and application email-sender extension; CSRF/rate-limited reset and confirmation endpoints; confirmed-email sign-in; reusable recovery UI and starter entry points. Links use a configured origin, are removed from browser history before bootstrap, and require explicit form submission. Successful reset signs out the requester; passwords are cleared after requests. The outbox is private and excluded from templates. Existing development configuration is preserved.

Verification: 76 frontend tests and 15 PostgreSQL HTTP integration tests pass. Tests cover token/user/purpose binding, tampering, single use, old/new passwords, identical account-existence responses and frontend secret cleanup. See LOCAL-ACCOUNTS.md. Production mail delivery is not configured or claimed verified.

Recovery browser verification: the local starter displays the generic request acknowledgement, consumes confirmation query tokens before rendering, and reports an invalid confirmation token without changing an account. Local npm/NuGet artifacts were refreshed and passed isolated consumer verification at `artifacts/verify-1790392677245/verification.json`: all four backend option combinations build and pass 33 unit tests each; primary frontend builds/tests and scaffold builds/tests pass. These checks do not qualify SQL Server runtime support or public registry publication.


### Resource-specification CRUD generation

Added `generate crud --spec ... --out ... [--dry-run]` for explicit scalar resource specifications. Generates module endpoints, descriptors, EF mapping hooks, typed inputs/outputs and Angular binding/menu, user-owned partial rules, fixtures and runnable backend/frontend tests. Supports exact decimal strings, date-only, enum, integer, boolean and bounded text/email fields. Generated list columns honor specification order, and non-text filters use equality. Existing output is refused and deterministic manifests identify ownership.

Source frontend suite: 79 passing tests. The generated Product module passes six backend tests including actual CRUD service behavior, stale versions, exact decimal serialization, validation and actual endpoint permission denial. Database-provider runtime qualification, relationships/alternate keys and regeneration remain pending; see RESOURCE-GENERATION.md.

Clean package verification passed at `artifacts/verify-1790393188018/verification.json`. The packaged resource generator produces a Product module with six passing backend tests, two passing frontend tests and a binding compiled into the independently installed Angular starter. Primary starter frontend: 27 tests; each of four backend configurations: 33 tests; fixed Supplier scaffold: four tests. This is package/build/service-test evidence, not generated Product database runtime qualification.


### Explicit resource regeneration

Added `generate crud --regenerate` and read-only `--regenerate --dry-run` plans. Generated files are hash-checked, custom validation and unrelated files are preserved, and edited/missing/colliding files are refused. Managed symlinks, traversal and forged ownership metadata are rejected. Output identity renames remain explicit migrations. A spec deliberately selected from the output directory may be edited and canonicalized without treating it as an implementation edit.

Application stages content, retains originals, commits the manifest last and rolls back ordinary failures. Interrupted/failed rollback state is retained in `.bqatlas-regeneration` and blocks retries; the guide documents manual recovery and the advisory-lock/concurrent-edit limits. This does not make database migrations automatic.

Focused verification: 15 CLI tests pass, including dry-run determinism, custom/untracked preservation, generated-source conflicts, observed concurrent edits and chmod, symlink/traversal rejection, injected write/rollback errors, obsolete generated-file removal and manifest ownership validation.

Packaged regeneration passed in `artifacts/verify-1790393636877/verification.json`: a Product weight field was added, a pre-existing application validation hook remained byte-for-byte intact and its behavior was exercised by a test, and the regenerated output passed eight backend tests, two frontend tests and independent Angular starter compilation. The primary starter passes 27 frontend tests; all four backend database/auth configurations pass 33 unit tests each. SQL Server runtime remains unqualified by this compilation matrix.


### Generated resource runtime and actual provider parity

Added an artifact-based runtime harness that installs the CLI and framework packages, generates Product, creates an isolated provider database, and exercises its real HTTP endpoints. The actual packaged REST/OData adapters compare the same 53-row fixtures, including server continuation, typed/GUID filters, exact large decimal strings, versioned writes and deletion. The host uses synthetic loopback-only cookie identities; it does not stand in for Identity/OIDC login qualification. Generated EF mapping is tested with EnsureCreated, not migrations.

This exposed and fixed a malformed-input bug: BadHttpRequestException from missing required JSON properties could become HTTP 500; framework handling now preserves the 4xx status with a generic safe problem response. OData now negotiates IEEE754-compatible JSON and handles bounded string-encoded counts; GUID filters use typed literals. Generator substitution is now one pass, so chosen names containing template tokens are not rewritten recursively.

Evidence: `artifacts/resource-runtime-1790394505948/verification.json` records all four PostgreSQL runtime scenarios passing against exact artifact hashes. Source frontend suite: 93 tests pass. Existing PostgreSQL integration suite: 15 tests pass on retry after intermittent local connection timeouts. The generated-resource test databases were confirmed removed. Both provider CI jobs now run this harness and retain TRX/artifact-hash evidence; SQL Server runtime is still not claimed verified.

Clean consumer verification also passed at `artifacts/verify-1790394697337/verification.json`, including compilation/tests for a module named CustomersArchive (containing original template tokens). Its artifact hashes exactly match the successful PostgreSQL runtime report. Both local development services were restored and responded successfully on ports 5100 and 4200.


### Installed starter executes the full HTTP workflow

Added `scripts/verify-starter-runtime.mjs` and a generated-app process harness. It installs the template in an isolated engine, restores real package dependencies into a private cache, builds Angular, places its bundle in the generated host's wwwroot, and launches that host without framework source references or replacement authentication endpoints. The real host migration command is run before startup and again after stopping the app.

`artifacts/starter-runtime-1790395163745/verification.json` records the successful PostgreSQL run: real local Identity/CSRF login, manifest permissions, Customer CRUD/lookup/OData, invalid and stale rejection, exact 26.24 quote total, submission/replay/read-only behavior, restart/session/data persistence and logout. The independent Angular assets are served by that host. One end-to-end scenario covers the complete sequence; this is not a browser-rendering claim. The bqatlas_starter_* test database was confirmed removed afterward.

Corrected generated starter instructions for password recovery and the IPv4 development URL, and documented resource generation/regeneration there. Both database CI matrix jobs now run the installed-starter workflow and retain its TRX and artifact-hash report. SQL Server and browser/mobile/accessibility qualification remain open.


### Session expiry and revocation qualification

Added SessionTests against the actual application middleware. A real local Identity login expires after advancing an injected cookie clock; an updated security stamp rejects the prior session. An independently configured OIDC host rejects an expired protected synthetic application cookie without redirecting to the provider. All three focused tests pass on PostgreSQL. The synthetic OIDC ticket deliberately tests application-cookie behavior, not remote token validation or a Keycloak callback. An initial fixture attempt accidentally selected local mode; the corrected test asserts OIDC mode before evaluating authentication.

Frontend tests connect the real AtlasApi, AtlasSession and WorkspaceService. For both auth-mode labels, a 401 clears identity, permissions, dirty tasks, pending-close state and metadata; a delayed manifest cannot restore prior-user state. All six framework tests pass. These tests now ship in the starter. Fresh consumer verification before that test-only template addition passed at `artifacts/verify-1790395894595/verification.json`, including the quote validation fix.


Latest verified artifact set: `artifacts/verify-1790396049186/verification.json` and `artifacts/starter-runtime-1790396084994/verification.json` contain identical package hashes. The refreshed starter passes all four backend option builds/33 unit tests each, 34 packaged frontend tests, generated Supplier/Product/regeneration tests and Angular builds. Its actual installed PostgreSQL host passes migrations, local login, customer CRUD/query/concurrency, transactional quote save/submit/replay, restart persistence and logout. Source frontend suite: 96 tests pass. SQL Server runtime, broad browser acceptance and public publication remain unqualified.


### Simultaneous tasks and mobile header

Browser review of the packaged isolated starter confirmed two retained customer editors and two independent quote drafts, active-task Ctrl+S isolation, reopening the existing dirty customer without duplication, mobile task switching, Escape cancelling dirty-close, and customer-lookup focus return. It found header overflow at 390px; account actions now wrap into a second row, with document width verified equal to viewport width at 320px and 390px. See WORKSPACE-BROWSER.md for precise scope and outstanding scenarios.

The rebuilt consumer rendered the corrected header. Refreshed template artifacts passed clean-consumer verification at `artifacts/verify-1790396434607/verification.json` (four backend configurations, 34 frontend tests/build, scaffold and regeneration checks). The isolated review host completed cleanup and removed its credential file; browser viewport override was reset. Delayed completion, broader accessibility and SQL Server runtime qualification remain outstanding.


### Detached save completion isolation

Added controlled asynchronous lifecycle tests. A save-and-close started by one task waits for its provider and removes only that task, preserving a newly active draft. A second test reproduced a bug where an old session's save completion cleared a new session's pending-close dialog after disposeAll. Workspace saves now verify that the original task/lifecycle remains retained before accepting success; save-and-close also verifies ownership of the pending dialog. The regression failed before the fix and passes afterward. All 98 source frontend tests pass.

Generic CRUD validation now checks active task ownership inside its after-render focus callback, matching the quote editor. This prevents a background validation response from moving focus to its editor. The focus guard is code-reviewed/build-verified; a delayed validation browser scenario remains separate acceptance work. No new HTTP or auth behavior is introduced.


The delayed-save fix is included in the artifacts verified by `artifacts/verify-1790396788929/verification.json`. All four backend configuration builds and 33 unit tests each pass; the installed starter passes 36 frontend tests and Angular build; generated Supplier/Product tests, custom-rule-preserving regeneration and boundary-name compilation pass. This supersedes the prior clean-consumer artifact snapshot. Backend runtime behavior is unchanged by these frontend lifecycle changes; no new SQL Server runtime claim is made.


### Documentation inside distributable packages

All six NuGet packages now declare a package README and include package-specific local install/usage guidance plus SOURCE-NOTICE.md. The three library npm packages now have READMEs; all four npm archives include the same canonical source notice. No distribution license or registry/repository identity was invented. NuGet's missing-README warnings are resolved.

`scripts/verify-package-docs.py` inspects the actual tar/zip archives, verifies useful README content, NuGet README metadata and byte-identical source notices, and preserves the npm UNLICENSED status until ownership/licensing decisions are made. Packing runs this check before writing the release manifest. Local installation and coordinated upgrade guidance is documented in PACKAGES.md.


Documented-package consumer verification completed successfully at `artifacts/verify-1790397722950/verification.json`: all four backend configurations pass builds and 33 unit tests each; 36 installed frontend tests, Angular build, scaffold/regeneration and generator boundary-name checks pass. All ten artifacts also pass archive README/source-notice validation.


### Ten-thousand-customer query qualification

VolumeTests passes against a uniquely named migrated PostgreSQL database with 10,000 synthetic customers. It verifies bounded first/middle/last REST pages, descending active filtering, OData count/last page, a 20-result active lookup and oversized-page rejection. Recorded response sizes range from 2,306 to 4,411 bytes; observed one-run TestServer times range from 15.4 to 193.0ms. See QUERY-VOLUME.md for context, exact figures and reproduction commands. This is not a browser-rendering or concurrency benchmark.

The initial combined test-write/run was rejected by automatic approval review because database isolation was not evident. Inspection confirmed ApiFixture creates and drops only its exact UUID-named test database. The test adds explicit name and empty-table assertions; the subsequent isolated run was approved and passed. No run seeded the configured development database.


### Accessible generic field errors

Generic enum, integer, boolean and decimal editors now expose invalid state and link to their existing field-error elements. Decimal controls expose their required state on the native input, and the Sales quote table has an accessible name. The updated packages build and all 98 source frontend tests pass. Archive documentation checks pass. Browser DOM qualification of these changes is still pending in the isolated `starter-runtime-1790398155957` workflow; do not treat the source/build checks as complete accessibility certification.


Rendered-DOM qualification now passes for the packaged Customer and custom quote editors in `starter-runtime-1790398155957`: named controls, native Customer label associations, resolving error references, no duplicate IDs, column-scoped quote headers and keyboard activation/focus-return checks. Its installed PostgreSQL HTTP workflow passes and cleanup removed the private review credentials. ACCESSIBILITY.md records the audit's limited scope, including untested generated enum/integer/decimal branches and remaining screen-reader/contrast/tab-order work. Clean-consumer matrix `verify-1790398457997` is still running at this checkpoint; do not assume completion until its report exists and passes.


The accessibility package consumer matrix completed at `artifacts/verify-1790398457997/verification.json`: all four backend configurations, 36 frontend tests/build, scaffold/regeneration and boundary-name checks pass. Its artifact set also passed the installed PostgreSQL runtime at `starter-runtime-1790398155957`.


### Generated Product browser and adapter-switch qualification

The optional generated-resource review harness installs the real template and CLI binding, serves generic list/editor components from installed packages, and provides REST/OData read selection with a synthetic loopback cookie. It has UUID database cleanup and an initialization guard. The first run failed on initial PostgreSQL connection timeout; the stopped run was followed by a successful fresh retry.

`artifacts/resource-runtime-1790398759901/verification.json` records all four PostgreSQL HTTP/provider scenarios passing with hashes identical to `verify-1790398457997`. Browser review verified 25 rendered rows from 54 records, enum/integer/decimal validation and accessibility references, corrected create, exact decimal persistence, unchanged generic views after switching to OData, and update with Save & close. The review file was removed on cleanup. See GENERATED-RUNTIME.md for scope; synthetic authentication and EnsureCreated do not replace Identity/OIDC or migration qualification.


### Latest combined PostgreSQL and shortcut verification

The complete source integration suite passes 29 tests, including Identity/recovery/session, CRUD/query/concurrency, Sales aggregate transactions, 10,000-customer volume, bearer validation and ten OIDC callback scenarios. Evidence: `artifacts/integration-postgresql-final/postgresql.trx`. A read-only catalog check found zero remaining `bqatlas_test_%` databases afterward. OIDC callback fixtures are synthetic and do not certify a live external provider.

Active window/title-bar focus now supports Control/Command+S through the registered task save lifecycle without duplicating editor-handled saves. The focused regression and all 99 source frontend tests pass; browser validation/focus evidence is in WORKSPACE-BROWSER.md. Rebuilt artifacts pass clean-consumer verification at `artifacts/verify-1790399880218/verification.json`: all four database/auth configurations build both applications and pass 33 backend plus 37 frontend tests each. The ten archives pass README/source-notice checks. This supersedes earlier consumer hash reports for the current files; installed runtime reports from earlier artifact sets remain historical and must be refreshed before release.


### Current artifact runtime evidence

The shortcut-fix package set now passes all three matching-hash reports: `verify-1790399880218/verification.json` (four-way clean-consumer builds/unit tests), `starter-runtime-1790400050177/verification.json` (installed generated host, real PostgreSQL migrations twice, local Identity, Customer CRUD, quote submit/replay/restart/logout), and `resource-runtime-1790400052325/verification.json` (four generated Product HTTP/EF and actual frontend REST/OData adapter tests). All paths are under `artifacts/`. Browser stale-save retention and reload recovery were additionally observed on the installed starter and recorded in WORKSPACE-BROWSER.md. Both runtime processes completed successfully; their reports are not pending browser holds. SQL Server runtime and external-provider qualification remain separate.


### Live external reader review

The existing Keycloak reader account now has browser evidence for login, Customer and Sales menu/read access, absence of create/edit/delete controls, logout confirmation/return, and a fresh provider login prompt after logout. See KEYCLOAK-READER.md for exact scope and the interrupted first attempt. The existing submitted quote was inspected without changes; draft-quote and live direct-write denial still require separate tests. The task-owned backend was restored to local Identity afterward. No package bytes changed during this review.


### Artifact refresh after contrast correction

Light-theme muted text and workspace copy were darkened after rendered measurements found insufficient text contrast. The production frontend build passes and corrected browser ratios/focus styling are recorded in ACCESSIBILITY.md. The package refresh is now complete. All ten archives pass documentation checks; the UI and starter CSS match source byte-for-byte. Matching-hash verification reports are `verify-1790401436680` (all four configurations, 33 backend and 37 frontend tests each plus builds), `starter-runtime-1790401436591` (installed PostgreSQL host/migrations/Identity/Customer/quote/restart/logout), and `resource-runtime-1790401436545` (four generated CRUD/provider parity tests). All three processes completed successfully. Earlier artifact reports remain historical evidence.
