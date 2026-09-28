# Commands and item selection

Batch 3 extends `@bqatlas/ui` without changing existing command IDs or outputs. Open **Forms & controls → Commands & assignment** for local price-list maintenance and warehouse assignment. **Open independent task** creates another draft with its own save/close lifecycle. Samples never change application permissions or business records.

## Shared commands

`AtlasCommand` retains `id`, `label`, `icon`, `primary`, `disabled` and `group`, and adds optional `hidden` and `permission`. IDs must be unique; `__more` is reserved by the toolbar. Pass the same definitions and current permission IDs to all placements. A missing permission hides an action; disabled actions remain visible. Every control checks current definitions and permissions again before emitting `command: string`.

- `AtlasMenuButton`: labelled popup trigger; inputs `commands`, `permissions`, `disabled`, `label`.
- `AtlasPopupMenu`: reusable flat, grouped menu. Open with `openAt(originElement, optionalClientPoint, lastItem?)`; close with `close(restoreFocus=true)`. `opened()` exposes state. The native Popover API places menus above clipped workspace panels and provides outside-click dismissal. Requires a browser supporting the Popover API. Menus remain bounded by the viewport, scroll when necessary, and dismiss on viewport resize.
- `AtlasContextMenu`: attach `[atlasContextMenu]="menu"` to a focusable record surface. Right-click or Shift+F10/ContextMenu opens it. Editable text retains its native pointer context menu. Also offer a visible menu button so touch users can perform the same actions.
- `AtlasSplitButton`: `primaryId` chooses the main action; other permitted commands become alternatives. If the primary command is unauthorized it disappears. All execution routes use the same output.
- `AtlasCommandToolbar`: automatically measures rendered command widths and moves the trailing commands into **More** when space runs out. Status content remains supported. Resize and permission changes recompute placement; the command definitions never change merely because the presentation narrows.

```html
<atlas-command-toolbar [commands]="actions" [permissions]="sessionPermissions"
  (command)="execute($event)" />
<atlas-menu-button label="Record actions" [commands]="actions"
  [permissions]="sessionPermissions" (command)="execute($event)" />
```

These UI permission checks are not backend authorization. The application handler must recheck its current permission/state, handle errors and await async execution; the server must enforce permissions independently. For registered application-menu commands, a handler can delegate to `AtlasMenus.activate(menuNodeId)`; pass current `AtlasSession` permissions to the UI placements. The local demo uses one handler with simulated permissions for every placement and checks again after its asynchronous save.

### Keyboard and focus

Toolbar: Left/Right and Home/End between enabled buttons; Down opens More. Menu triggers: Enter/Space or Down (Up on `AtlasMenuButton` opens at the last item). Menus: Up/Down wrap; Home/End move to boundaries; a letter finds the next matching label. Disabled menu items remain focusable to explain unavailable actions but cannot execute. Escape closes and restores the trigger; Tab closes and continues ordinary focus traversal. Outside-click dismissal leaves focus at the pointer destination. Context-menu triggers need `tabindex="0"` if they are not natively focusable. Nested submenus are not included in this release.

## Item selector

`AtlasItemSelector` implements `FormValueControl<string[]>` for Angular signal forms, or can use `[(value)]` directly. It requires a unique `controlId`. Inputs: `options: AtlasOption<string>[]`, `label`, `availableLabel`, `assignedLabel`, `limit` (zero = unlimited), `reorderable`, and the usual `disabled`, `readonly`, `invalid`, `touched`, `describedBy` field state.

The value is the ordered list of assigned IDs. Labels/descriptions come from options; IDs must be unique. A left-side search filters available options only, never the value. Unknown assigned IDs are preserved as unavailable entries. Disabled options cannot transfer or reorder, and other options cannot reorder across a locked entry. An addition exceeding the limit is rejected as a whole, with an announcement. The parent owns validation, persistence and its option data.

Native multi-select lists support Ctrl/⌘ and Shift selection. Add/Remove and Move up/Move down buttons provide every operation. Alt+Right adds from the available list; Alt+Left removes from the assigned list; Alt+Up/Down reorders selected assigned items as a block. This release does not require dragging. Read-only allows inspection/selection but blocks changes; disabled blocks the whole field. The component exposes focus and touch integration to signal forms. Use a unique control ID for each task instance.

The demo binds the selector directly to a signal form. Saves validate decimal price strings and at least one warehouse, retain drafts on failure, reject completions from reset/disposed instances, and preserve newer edits. The selected task participates in the workspace's standard unsaved-changes dialog. Reset affects only the local demo instance.
