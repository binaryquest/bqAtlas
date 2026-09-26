# @bqatlas/ui

This is an unpublished development preview (`0.1.0-alpha.1`). Install from the local artifact directory; the source is MIT-licensed; registry publication and package ownership will be configured later. See `SOURCE-NOTICE.md` included in this package.

Angular Atlas workspace and controls. Import components and `WorkspaceService` from `@bqatlas/ui`; include the theme in application CSS:

```css
@import "@bqatlas/ui/theme.css";
```

The optional `@bqatlas/ui/documents` entry point needs the PDF.js peer. Basic workspace applications do not need PDF.js. Keep task identity stable, provide asynchronous lifecycle save handlers and dispose retained tasks when the session ends.

## Local installation

```sh
npm install /absolute/path/to/artifacts/npm/bqatlas-ui-0.1.0-alpha.1.tgz
```

Install matching local bqAtlas tarballs together so peer resolution does not depend on public registry availability. Angular packages require the peer versions declared in package.json. The starter requires Node 24.15+.
