# @bqatlas/angular

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

ERP integration for Atlas: `AtlasApi`, `AtlasSession`, resource providers, metadata CRUD, navigation, field extensions and account forms. Install matching UI and contracts packages and include both stylesheets:

```css
@import "@bqatlas/ui/theme.css";
@import "@bqatlas/angular/styles.css";
```

Register application resource features and menu bindings through `CrudWorkspace`. REST and bounded OData adapters implement the same resource-provider contract; OData writes delegate to REST. Browser authentication uses same-origin cookies and CSRF protection, with no bearer tokens in browser storage. The matching full-stack template provides executable registration examples.

## Local installation

```sh
npm install /absolute/path/to/artifacts/npm/bqatlas-angular-0.1.0-alpha.1.tgz
```

Install matching local bqAtlas tarballs together so peer resolution does not depend on public registry availability. Angular packages require the peer versions declared in package.json. The starter requires Node 24.15+.
