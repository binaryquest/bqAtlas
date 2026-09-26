import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const config = new URL('.env.keycloak', root);
if (existsSync(config)) {
  console.log('.env.keycloak already exists; preserving credentials and realm configuration.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('base64url');
const clientSecret = secret();
const password = secret() + 'aA1!';
const realm = {
  realm: 'bqatlas', enabled: true, registrationAllowed: false,
  resetPasswordAllowed: false, sslRequired: 'none',
  roles: { realm: [{ name: 'bqatlas-admin' }, { name: 'bqatlas-reader' }] },
  clients: [{
    clientId: 'bqatlas', enabled: true, protocol: 'openid-connect',
    publicClient: false, secret: clientSecret,
    standardFlowEnabled: true, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: ['http://localhost:4200/signin-oidc', 'http://127.0.0.1:4200/signin-oidc'],
    webOrigins: ['http://localhost:4200', 'http://127.0.0.1:4200'],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': 'http://localhost:4200/signout-callback-oidc##http://127.0.0.1:4200/signout-callback-oidc',
    },
    defaultClientScopes: ['profile', 'email', 'roles'],
    protocolMappers: [{
      name: 'application realm roles', protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-realm-role-mapper',
      config: {
        'claim.name': 'realm_access.roles', 'jsonType.label': 'String',
        multivalued: 'true', 'id.token.claim': 'true', 'access.token.claim': 'true',
      },
    }],
  }],
  users: ['admin', 'reader', 'unassigned'].map(name => ({
    username: name, enabled: true, emailVerified: true,
    email: `${name}@bqatlas.local`, firstName: name, lastName: 'Development',
    realmRoles: name === 'unassigned' ? [] : [`bqatlas-${name}`],
    credentials: [{ type: 'password', value: password, temporary: false }],
  })),
};
const directory = new URL('artifacts/keycloak/', root);
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(new URL('bqatlas-realm.json', directory), JSON.stringify(realm, null, 2), { mode: 0o600 });
writeFileSync(config, `Authentication__Mode=oidc
Authentication__Oidc__Authority=http://localhost:28080/realms/bqatlas
Authentication__Oidc__ClientId=bqatlas
Authentication__Oidc__ClientSecret=${clientSecret}
Authentication__Oidc__RequireHttpsMetadata=false
KEYCLOAK_TEST_PASSWORD=${password}
`, { mode: 0o600 });
console.log(`Created private Keycloak realm and ${fileURLToPath(config)}. Use localhost:4200 for callback consistency.`);
