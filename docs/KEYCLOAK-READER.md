# Live Keycloak reader qualification

## Automated live-provider verification

`node scripts/verify-keycloak-runtime.mjs` installs the actual local starter package, builds its host, creates a uniquely named database, and starts a disposable Keycloak 26.7 container with a private generated realm. It uses the generated starter's role mappings and real authorization-code callbacks, token exchange and provider keys. It does not mint synthetic application tickets or change production authentication settings.

The PostgreSQL run at `artifacts/keycloak-runtime-1790478728158` passes:

- Real admin, reader and unassigned login; the provider requires S256 PKCE, including .NET 10's pushed authorization request path.
- Admin Customer and draft-quote creation, and exactly the reader's three mapped permissions.
- Reader REST/OData/lookup access; disabled edit/delete/submit capabilities on a **draft** quote.
- Seven direct reader create/update/delete/submit attempts return 403 with valid CSRF tokens and versions; original record versions remain unchanged.
- Unassigned identity has no permissions/resources; five direct read/query/lookup attempts return 403.
- Logout clears the application session and the Keycloak session; the next challenge requires credentials.
- Automatic deletion of the exact test database, removal of the temporary provider container and private realm/credential files.

Run after `node scripts/pack.mjs`, with Docker available and a disposable database server configured through `.env` or `BQATLAS_TEST_PROVIDER` / `BQATLAS_TEST_CONNECTION`. `BQATLAS_ARTIFACT_ROOT` optionally points to another checkout containing a verified `artifacts/` directory. The provider uses random loopback ports and does not modify the existing development Keycloak profile. Reports include archive hashes and the actual provider image identity, but no credentials. CI runs the verifier for both database providers.

The HTTP test client follows the provider's actual HTML forms and redirects. A narrowly scoped cookie handler emulates browser Secure-cookie behavior only for the two explicit loopback development origins; it is test code, not a production HTTP client. These checks qualify live-provider protocol and API behavior, not browser rendering or additional identity providers. The initial harness runs exposed PAR, loopback-cookie and relative-form assumptions; those failed attempts cleaned up their databases and containers and are not counted as passing evidence.

## Earlier browser review

On 2026-09-26 the source development application was temporarily run with its configured Keycloak profile, using the existing local Keycloak realm and reader account. No realm settings or credentials were changed. Existing Customer and quote records were read only.

The successful browser flow returned from Keycloak to the application with display name `reader`. Both Customers and Sales quotes appeared in the menu. The Customer list loaded its existing record without a New action. Its record view had disabled Code/Name/Email/Active controls, a Reload action, and no Save or Delete actions. Sales quotes similarly had no New action. The existing submitted quote loaded with its customer, two lines and exact 26.24 total; its header and line controls were disabled and no Save, Submit, Add line or Delete actions appeared. Because this quote was already submitted, its record state independently enforces read-only behavior; this observation alone does not prove draft-quote authorization.

Sign out cleared the application workspace and reached Keycloak's Logout confirmation. Confirming Logout returned to the application's external-login screen. Starting login again presented the username/password form, establishing that the provider session no longer silently signed the reader back in. The review tabs were closed and the backend was restored to local Identity mode afterward.

The first login navigation briefly lost its browser handle and the subsequent submission reported invalid credentials. A fresh login flow using the same configured credentials succeeded; no credential reset was performed. This is recorded as an interrupted-flow failure, not a successful login test.

Direct browser navigation to the session API was blocked by the browser client. No security restriction was bypassed. This review qualifies live provider reader login, UI capability presentation, read access and logout only; it does not prove live-reader direct API write denial, OData policy parity, draft-quote denial, or negative provider callbacks. Existing HTTP permission and synthetic callback tests remain separate evidence.


## Complementary external-session API tests

`ExternalAuthorizationTests` starts the real sample host in OIDC mode, invokes its configured post-token-validation role mapping with synthetic issuer/subject/realm roles, and protects the resulting application cookie with the actual cookie scheme. It deliberately adds untrusted write/submit permission claims before mapping. The resulting reader session contains only customer read/lookup and quote read; an unassigned session has no permissions. The manifest exposes exactly the reader's two resources and none for the unassigned identity.

Twenty-one direct HTTP attempts cover Customer and quote create/update/delete, quote submission, and (for the unassigned identity) record reads, queries, lookup, OData count and an expansion attempt. Every attempt returns 403 without redirecting to an identity provider. The fixture configures an unused database endpoint; the tests pass without any database server, demonstrating that permission rejection precedes persistence access. Requests supply a CSRF token; authorization rejects them before business operations run.

The combined external-authorization, OIDC callback and bearer selection passes 13 tests. Evidence: `artifacts/external-authorization/external-authorization.trx`. These tests intentionally start after provider-token validation; they do not turn synthetic tickets into live Keycloak direct-API evidence. They complement the real callback middleware tests and the live browser review above. CI's integration suite includes the new tests.
