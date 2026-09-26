# Independent starter runtime verification

After building local artifacts with `node scripts/pack.mjs`, run:

```sh
node scripts/verify-starter-runtime.mjs
```

The runner reads `.env` when present, with explicit `BQATLAS_TEST_PROVIDER` and `BQATLAS_TEST_CONNECTION` taking priority. It requires a PostgreSQL or SQL Server account capable of creating/dropping a uniquely named test database. Node 24.15+ and .NET 10 must be available.

The check installs the actual template into an isolated template-engine environment and generates `AcmeErp`. Framework dependencies come from the local npm/NuGet artifacts and a private NuGet cache, with no framework source-project references. It compiles the generated Angular app and places its output in the generated host's `wwwroot`, following the starter's deployment instructions.

The test launches the generated `Host.dll` as a real child process. It applies the generated migration assemblies using the host's own `--migrate` command. Local Identity uses a fresh development bootstrap account with an in-memory random password; the password is passed through process environment, not a command-line argument or verification report. The host listens on an allocated loopback port.

The workflow verifies:

1. The actual host serves the Angular index and entry bundle; anonymous session/manifest behavior is correct.
2. Login requires CSRF and succeeds with the bootstrapped Identity account; session permissions and CRM/Sales metadata are present.
3. Customer creation, update, lookup, OData reads, invalid/stale rejection and deletion of a separate disposable customer work.
4. A quote with two lines calculates exactly `26.24`, submits, becomes read-only and replays the same idempotency key without another version change.
5. The host is stopped, migrations are reapplied, and it is restarted. Existing data/version/status and the development login session survive.
6. Logout clears the browser-style cookie session and protects direct record access again.

The fixture records its provider, exact database name and lifecycle state in `database-lifecycle.json` before migration. It records `deleted` only after successful deletion, or `cleanup-failed` with an exception type on failure; no connection string, password or exception message is stored there. A failed cleanup still fails the test run. Use this record to reconcile one failed run; never delete databases using a broad prefix. Runs predating this record cannot supply it retroactively.

The fixture stops its child process and deletes only its exact `bqatlas_starter_<UUID>` database during cleanup. It does not use or mutate the development sample database. No synthetic authentication handler or replacement endpoints are injected into the generated host.

The check proves that the packaged application runs through this HTTP workflow and serves its frontend assets. It does not render Angular in a browser or qualify keyboard/mobile/accessibility behavior. It also does not exercise OIDC or production deployment/key-ring configuration. Those have separate acceptance checks.

Evidence is stored in `artifacts/starter-runtime-*/verification.json` with the exact artifact hashes, and `results/starter.trx`. PostgreSQL has passed locally. Both database CI jobs now run the command, but an executed SQL Server result is still required before claiming that provider is qualified.


### Interactive browser review

Run `node scripts/verify-starter-runtime.mjs --browser-review` to pause the disposable starter after its HTTP checks. The runner writes a private `browser-review.json` containing the local origin and synthetic login credentials. Keep it private. Create `browser-review.json.done` when finished; the runner removes credentials, stops the host, and drops its isolated database. The hold expires after 40 minutes. This option does not automatically certify browser rendering.

Browser review on 2026-09-26 found that empty quote saves returned a generic JSON-binding error. The quote editor now validates editable headers and lines before sending, associates errors with controls, and focuses the first invalid control only when its task is active. Server validation remains authoritative.

Verified in the isolated generated consumer `starter-runtime-1790395519448`: login; customer lookup selection using Enter/Down/Enter; empty quote focuses Customer; after customer selection Ctrl+S focuses missing line description; zero quantity retains entered text and focuses Quantity; corrected quantity 2.125 and price 12.3456 save through Ctrl+S with total 26.23. The two quote source files were copied into this consumer and Angular rebuilt for the corrected browser check. Consequently this is evidence for the source fix, not an unchanged published-template artifact. Seven focused quote tests and the Angular build passed. The fix subsequently shipped in the refreshed template: clean-consumer verification `verify-1790396049186` and installed PostgreSQL runtime `starter-runtime-1790396084994` pass against identical artifact hashes.

Subsequent browser reviews qualify retained customer/quote tasks, mobile task switching and narrow header layout, and two-tab stale-save retention/reload recovery. See WORKSPACE-BROWSER.md for the exact artifact/source distinctions. Controlled delayed-save ownership and successful keyboard quote save/submission now have separate browser evidence in WORKSPACE-BROWSER.md. Native exit confirmation and broader accessibility checks remain. The current successful installed runtime report is `starter-runtime-1790401436591`; its artifact hashes match clean-consumer `verify-1790401436680` and generated-resource `resource-runtime-1790401436545`. The later keyboard review `starter-runtime-1790402623973` passed its workflow assertion but failed database cleanup; it is not a passing runtime report.


### Cleanup recovery validation

The lifecycle-record change was compiled against the installed consumer, and `artifacts/starter-lifecycle-check/results/lifecycle.trx` passed the actual PostgreSQL starter workflow with the revised fixture. Its `database-lifecycle.json` ended at `deleted` with no failure type. The validation report records the ten unchanged package hashes. This rerun reused the previously installed consumer rather than regenerating/repacking packages; it specifically verifies the harness change and automatic cleanup. The earlier failed review database was separately identified by its exact quote ID and removed, as recorded in WORKSPACE-BROWSER.md. CI retains the lifecycle record alongside the runtime TRX.
