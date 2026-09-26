# Local account flows

Local mode uses ASP.NET Core Identity's EF-backed user store. Public registration is disabled. Development bootstrap creates a new supplied account only in Development and never silently resets an existing password or grants existing users new permissions.

Authenticated local users can submit `/auth/change-password` with `currentPassword` and `newPassword`. The endpoint requires the browser session, CSRF token and login rate limiter. Identity verifies the current password and applies its configured password policy. Success changes the security stamp and signs out the current browser; the old password no longer works. Other browser sessions are revalidated according to the host's Identity security-stamp validation interval, not necessarily immediately.

The reusable `AtlasPasswordChange` component is included in the starter's local-mode header. It requires unsaved work to be saved or closed before proceeding, clears password values after a submitted request, displays policy failures, and returns the user to sign-in after success. OIDC users manage passwords with their provider and do not receive this local action.

PostgreSQL HTTP tests cover anonymous denial, CSRF, incorrect current password, weak replacement password, successful change, current-browser sign-out and old/new password login behavior. Frontend tests cover guarded transitions and secret-field cleanup. Local account administration and MFA UI are not provided by this release slice; their absence must not be inferred from Identity's underlying capabilities.

## Password reset and email confirmation

The local module provides CSRF-protected, rate-limited POST endpoints:

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `/auth/request-password-reset` | `email` | 202 with a generic JSON acknowledgement |
| `/auth/request-confirmation` | `email` | 202 with the same acknowledgement |
| `/auth/reset-password` | `userId`, `token`, `newPassword` | 204 |
| `/auth/confirm-email` | `userId`, `token` | 204 |

Requests do not disclose account existence or confirmation status in their response bodies. Reset emails are issued only for confirmed accounts; confirmation emails are issued only for unconfirmed accounts. Local sign-in requires a confirmed email. Identity validates purpose-bound, user-bound tokens and its password policy. A successful password reset changes the security stamp, invalidates reuse of the reset token and signs out the requesting browser. Other sessions remain subject to the configured stamp-validation interval.

`AtlasAccountRecovery` supplies request, reset and confirmation forms. The starter consumes recovery query parameters before application bootstrap, removes them from browser history, and holds them only in component memory. Confirmation requires a deliberate POST; loading a link does not confirm the account. Submitted passwords are cleared on success and failure; successful token use releases the parent reference. Refreshing the consumed page requires reopening the original email link. The starter sets a no-referrer policy. Deployments should also avoid logging sensitive incoming query strings at their proxy or hosting layer.

### Development delivery

New `setup-dev.mjs` environments include `Identity__DevelopmentEmail=true` and `Identity__PublicOrigin=http://127.0.0.1:4200`. Existing `.env` files are preserved; add these settings explicitly when upgrading an existing development workspace. With Development enabled, mail is written as private JSON files under the host content root's `.local-mail/` directory. Open the `ActionUrl` from the desired message in the browser. Files and directories use owner-only Unix permissions and are excluded from git and generated templates. Delete messages when no longer needed. Nothing is sent to an external mailbox by this development sender.

For deployment, register an application implementation of `IAccountEmailSender` and configure `Identity:PublicOrigin` as the public HTTPS origin. The framework preserves an explicitly registered sender. The development sender cannot run outside Development. Missing delivery or invalid origin configuration returns 503 consistently, before looking up an email address. PublicOrigin is configuration, never derived from the request Host header.

PostgreSQL integration tests verify CSRF rejection, identical known/unknown responses, reset token tampering, user binding, single use, old/new password behavior, confirmation and token-purpose separation. Frontend tests verify URL cleanup, explicit confirmation, generic acknowledgement, password cleanup and successful reset session clearing. Production email transport and real mailbox delivery remain application responsibilities; these tests use an in-memory sender.


## Session expiry and revocation

The default application cookie has an eight-hour lifetime with sliding renewal. An expired cookie yields an anonymous session response; protected API and OData requests return 401 without a login redirect. The frontend responds to 401 by clearing identity, permissions, metadata and all retained tasks, including dirty drafts. Delayed responses from the old session cannot repopulate its manifest. Applications should communicate this loss of unsaved work in their deployment's session policy.

Local Identity also validates its security stamp on the configured interval. The integration suite uses a zero validation interval to prove revocation deterministically; this does not change the production default. OIDC application-cookie expiry is tested with a protected synthetic ticket and a controlled clock, independently of provider availability. It does not imply immediate revocation when a provider account or its roles change. Reference Keycloak login/logout is qualified separately.

`SessionTests` runs as part of the real-provider integration suite (`node scripts/backend.mjs test:integration`). Its local login and stamp checks use the disposable migrated Identity database. Frontend `framework.test.mjs` uses the actual API/session/workspace services with controlled responses; these tests are included in the generated starter's `npm test` command.
