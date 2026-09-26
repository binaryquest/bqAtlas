# OIDC callback qualification

`backend/tests/BqAtlas.IntegrationTests/OidcCallbackTests.cs` runs the framework's real ASP.NET Core OIDC and cookie handlers in TestServer, with RSA-signed synthetic provider responses. It requires neither a database nor a live identity provider.

Ten scenarios cover successful login, an unmapped role, wrong issuer, wrong audience, expired ID token, wrong signature, wrong nonce, missing nonce, tampered state, and missing correlation cookie. The test checks the specific rejection cause, absence of an application cookie, and anonymous access after rejection. State/correlation failures must stop before token exchange.

The successful exchange verifies an authorization-code challenge, S256 PKCE challenge/verifier agreement, redirect URI, and nonce. The resulting application cookie authenticates the expected user and retains the validated issuer. A provider-supplied application permission is removed; only the configured reader role grants `records.read`, and write access remains forbidden. An unmapped role authenticates with no application permissions.

The synthetic ID tokens include the required issue-time claim. The initial fixture omitted it; correcting the fixture restored successful cases without changing production validation.

Run:

```sh
dotnet test backend/tests/BqAtlas.IntegrationTests \
  --filter 'FullyQualifiedName~OidcCallbackTests|FullyQualifiedName~BearerTests' \
  --logger 'trx;LogFileName=oidc-callback.trx' \
  --results-directory artifacts/auth-callback
```

Latest result: 11 passed, zero failed (10 callback scenarios and one bearer test). Evidence: `artifacts/auth-callback/oidc-callback.trx`.

The fixture catches authentication failures and reports 401 solely for test assertions. It does not qualify the production error-page experience. It also does not establish live Keycloak behavior, browser cookie-policy compatibility, provider logout/revocation, token-key rotation, callback replay, or SQL Server support. Those require separate evidence. No production authentication code changed for this qualification.
