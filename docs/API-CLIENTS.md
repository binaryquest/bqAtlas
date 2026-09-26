# Optional API bearer tokens

The host can accept signed JWT access tokens for API clients independently of the browser login mode. This is disabled unless explicitly configured:

```json
{
  "Authentication": {
    "Bearer": {
      "Enabled": true,
      "Authority": "https://identity.example/realms/company",
      "Audience": "bqatlas-api",
      "ScopePermissions": {
        "customers.read": ["crm.customers.read", "crm.customers.lookup"],
        "customers.write": ["crm.customers.read", "crm.customers.write", "crm.customers.lookup"]
      }
    }
  }
}
```

Configure the provider to issue access tokens for that API audience with the intended scopes, then send `Authorization: Bearer <access-token>` to `/api` or `/odata`. The application validates issuer, audience, signature and lifetime, with a 30-second clock skew. Tokens must contain a subject. Only explicitly mapped `scope`/`scp` values grant API permissions; token-supplied application permission claims are removed. Role mapping used for browser OIDC does not implicitly grant API scopes.

On API paths, an Authorization header selects bearer authentication. An invalid token fails rather than falling back to a valid browser cookie. Successfully validated bearer requests do not need a CSRF token, because they authenticate explicitly through the header. Cookie requests retain CSRF checks. `/auth` account/login/logout routes always use browser authentication and retain CSRF protection even if an Authorization header is present.

The framework does not issue OAuth tokens or manage machine-client secrets. Provision clients, scopes and API audiences at the selected provider. Keep `RequireHttpsMetadata` enabled outside an explicitly isolated HTTP development provider. Browser code continues using HttpOnly cookies; this option does not introduce browser token storage.

Tests exercise the actual ASP.NET authentication/authorization/filter pipeline with locally signed tokens and in-process issuer metadata. Provider-specific audience/scope provisioning still needs deployment qualification. SQL Server runtime qualification remains separate.
