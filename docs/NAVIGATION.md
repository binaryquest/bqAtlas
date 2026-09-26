# Workspace URLs and browser navigation

Inject `AtlasNavigation` once in the application shell. It connects the authenticated resource registry and retained workspace tasks to hash URLs:

- `#/` opens workspace home.
- `#/list/crm.customers` opens the registered Customer list.
- `#/record/crm.customers/<encoded-id>` opens a saved record.
- `#/draft/task-123` reactivates an existing in-memory draft only in the current workspace.

Saved-record IDs are encoded as opaque values. Links resolve only through registered resources and current read permissions. Invalid, unavailable or stale draft links return home with an error. Browser Back/Forward changes the active retained task and does not close or discard drafts. Page reload or leaving the site still invokes the workspace's native unsaved-work guard where supported by the browser.

An incoming route can be retained through external sign-in in sessionStorage; it contains only the route, never record contents or tokens. Navigation continues to work if storage is unavailable, but that external-login restoration then cannot be guaranteed. Session end clears the remembered route. Unsaved drafts are not persisted or reconstructed after reload.

Browser acceptance has covered list/record URL changes, Back/Forward retaining the same tasks and saved-record restoration after reload. External-login return links, native page-exit dialogs and mobile history behavior remain additional acceptance checks.
