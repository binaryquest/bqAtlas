# Layout controls and the example browser

Batch 1 adds reusable layout primitives to `@bqatlas/ui` and a composed local customer-maintenance example. Import the existing `@bqatlas/ui/theme.css`; all controls use Atlas density and theme tokens.

## Tabs

```ts
imports: [AtlasTabs, AtlasTab]
```

```html
<atlas-tabs label="Customer sections" [(selected)]="section">
  <ng-template atlasTab="details" label="Details">…</ng-template>
  <ng-template atlasTab="contacts" label="Contacts">…</ng-template>
  <ng-template atlasTab="history" label="History" [disabled]="!canReadHistory">…</ng-template>
</atlas-tabs>
```

Use unique, stable tab keys. Each tab body is created on its first visit and remains mounted while hidden, preserving control/draft state. Arrow Left/Right wrap among enabled tabs; Home/End choose the first/last. Selection and focus move together. Tab leaves the tab list normally. The first enabled tab is the fallback if the selected key is absent or disabled. IDs are scoped to each component instance and connect tabs with their panels.

Disabled tabs are a UI affordance, not authorization. Do not project sensitive data that the current user must not access.

## Fieldsets and accordion sections

```html
<atlas-fieldset label="Company" [collapsible]="true" [(collapsed)]="companyCollapsed">
  …labeled form controls…
</atlas-fieldset>
<atlas-accordion-section label="Delivery instructions" [(expanded)]="deliveryOpen">
  …
</atlas-accordion-section>
```

Both retain projected content when collapsed. Fieldsets use native fieldset/legend semantics; `disabled` disables native descendant form controls. Composite/custom controls must also receive their own disabled input where required. Accordion sections expand independently; bind their expanded models in the application if only one should be open. Buttons support native Enter/Space activation and expose expanded state.

## Split panes

```html
<atlas-split-pane primaryLabel="Customers" secondaryLabel="Record"
  [(ratio)]="listPercent" [minimum]="22" [maximum]="55" [breakpoint]="720"
  [(collapsed)]="listCollapsed">
  <div atlasSplitPrimary>…</div>
  <div atlasSplitSecondary>…</div>
</atlas-split-pane>
```

Ratio and limits are percentages. Pointer dragging and keyboard Left/Right resize the primary pane. Shift increases the keyboard step; Home/End reach the configured bounds. The focusable separator exposes its current value and controlled pane. A local ResizeObserver switches to stacked panes below the breakpoint, including when its containing window is resized. Hide/Show preserves primary content and its state. Width/collapse state belongs to this instance; the control does not persist global preferences.

## Panel sections

`AtlasPanel` now supports `panelToolbar` and `panelFooter` alongside existing `panelActions` and ordinary body content. Empty new slots occupy no space. Put `AtlasCommandToolbar` inside `panelToolbar` to retain its grouped-command keyboard behavior. This extends existing panels without replacing their API. Popup menu/overflow commands remain Batch 3.

## Examples

Open **Forms & controls** on the workspace home/Start menu. The example browser has searchable categories, API/keyboard notes, compact/comfortable density and an optional narrow-content preview. Mobile layouts use a category selector. Demos are created on first visit and retained thereafter.

- **Layout workbench** demonstrates tabs, a disabled tab, collapsible fieldsets, a disabled native fieldset, accordion content, split panes and panel slots. Its form is transient local demonstration data.
- **Customer maintenance** combines tree navigation, searchable customer list, details/contacts/history tabs and local save. Drafts are retained per customer while switching records/examples. Save validates all customer drafts, selects the first invalid record, opens the correct tab and focuses the field. Save failure preserves all drafts; retry commits a snapshot locally. Read-only mode blocks edits and save. Reset uses a confirmation dialog and affects only this demo.
- Customer drafts participate in the example task's dirty-close and save lifecycle together with the existing purchase-order demo. Saving multiple demo stores is sequential, not a cross-module database transaction. A failure keeps the task open; a preceding successfully saved demo stays saved.
- CRUD links still open real permission-filtered application records. Demo values do not call these APIs or alter the backend.

## Verification

`npm test --prefix frontend` includes navigation/focus, splitter limits, per-instance draft isolation, cross-record validation, failed-save recovery and read-only/reset tests. These tests are also copied into generated starters. Production compilation validates all new templates. Browser review checks the composed screen, tab keys, collapsed state retention, splitter keys, linked validation, simulated failure/retry, example search, mobile stacking, density and dirty-close behavior. These checks do not establish full browser-matrix or accessibility certification.
