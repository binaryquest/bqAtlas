# Ext JS 3.4 UI study and bqAtlas expansion plan

Studied 2026-09-28 against bqAtlas source at `904f535`. This is a design and coverage review, not a claim of Ext JS feature parity or an implementation change.

## Evidence and scope

Read the rendered [example gallery](https://extjs.cachefly.net/ext-3.4.0/examples/) and visually inspected these examples:

- [Dynamic forms](https://extjs.cachefly.net/ext-3.4.0/examples/form/dynamic.html): simple forms, fieldsets, columns, embedded tabs and editor area.
- [Composite fields](https://extjs.cachefly.net/ext-3.4.0/examples/form/composite-field.html): multiple related inputs on one labeled row and combined validation presentation.
- [Grouped summaries](https://extjs.cachefly.net/ext-3.4.0/examples/grid/totals.html): visible group headers, detail rows, subtotal rows and formatted numeric columns.
- [MultiSelect/ItemSelector](https://extjs.cachefly.net/ext-3.4.0/examples/multiselect/multiselect-demo.html): available/selected lists with transfer and order controls.
- [Toolbar overflow](https://extjs.cachefly.net/ext-3.4.0/examples/toolbar/overflow.html): compact toolbar with menu affordances inside a window. Its narrow-width overflow interaction was not tested.
- [Theme sampler](https://extjs.cachefly.net/ext-3.4.0/examples/themes/index.html): coordinated panels, menus, fields, toolbars, grids, fieldsets and border regions.
- [Layout browser](https://extjs.cachefly.net/ext-3.4.0/examples/layout-browser/layout-browser.html): shell rendered, but its navigation tree did not populate during inspection.
- [TreeGrid](https://extjs.cachefly.net/ext-3.4.0/examples/treegrid/treegrid.html): column shell rendered without rows. Hierarchical behavior is gallery-described, not verified interactively here.
- [Row editor](https://extjs.cachefly.net/ext-3.4.0/examples/grid/row-editor.html): explanatory page rendered, but the editor itself did not render during inspection.

The remaining gallery entries were inventoried by their displayed category/title/description, not individually tested. Old remote-data and plugin-dependent examples should not be treated as working acceptance fixtures.

Compared with `frontend/projects/ui/src/public-api.ts`, its component implementations, the 31 entries in `docs/atlas-controls/catalog.json`, and the eight-section starter showcase. Catalog entries describe example topics, not 31 independent production components.

## Visual direction

Ext JS communicates a structured desktop application: thin panel borders, compact title bars, aligned labels, short control rows, contextual toolbars, nested regions and clear grid headers. Repeated panel anatomy makes complex screens easier to scan. Many controls and related records fit within one work area.

For Atlas, retain our typography, color tokens and taskbar workspace while making this structure more consistent:

1. Standard panel anatomy: title/actions, optional toolbar, body, optional status/footer. Collapse, loading and empty states should belong to the component.
2. Shared compact/comfortable density across forms, grids, tabs, toolbars and dialogs. Existing density support needs cross-component examples and measured consistency, rather than a second unrelated theme.
3. Shared label widths and responsive form columns. Related inputs such as quantity/unit or amount/currency can occupy a composite row with explicit individual accessible names.
4. Resizable split regions for navigation/list/details; preserve a usable mobile stack and keyboard resizing.
5. Consistent separation between section padding, field spacing, toolbar spacing and action rows. Compact must still be readable and operable.
6. Clear selected, focused, dirty, disabled, loading and invalid states in every example.

Build native Angular components and CSS. The reference supplies interaction ideas; its legacy source/assets are not needed for our MIT implementation.

## Coverage and gaps

“Existing” means present in source/examples, not blanket accessibility or feature-parity certification.

| Area | bqAtlas now | Addition or refinement |
| --- | --- | --- |
| Text, select, choice groups, toggle, dates, decimals | Existing controls and examples | A uniform field-state gallery, label alignment, composite rows, explicit time input example |
| Remote/multi-column selection | Lookup, autocomplete, multiselect and dependent lookup examples | Rich remote combo examples with paging/loading/error states; keep key/label separation explicit |
| Form containers | Basic panel/field; supplier layout uses native details | Reusable fieldset/accordion, responsive form layout and tabs with retained field state |
| Tabs and card/wizard layouts | Showcase navigation is buttons plus hidden sections; task windows are separate | Accessible reusable tabs, overflow/close behavior where needed, step validation and wizard navigation |
| Split/border layouts | Responsive master/detail component and movable workspace windows | Reusable keyboard-resizable split panes and collapsible side regions; no fixed-position form layout engine needed |
| Toolbars/menus | Grouped command toolbar with keyboard navigation; Start menu | Shared popup/context menu, split/menu buttons, overflow and shared command state across menu/toolbar |
| Data table | Filter/sort/page, selection, column management/pinning, row details | Collapsible grouping, group/grand summaries and grouped headers; distinguish page totals from whole-query totals |
| Editing | Editable grid, continuous datasheet, generic CRUD and quote aggregate | Focused cell/row/batch-edit examples; shared validation, cancel and stale-save behavior instead of another unrelated grid |
| Hierarchy | Searchable single-selection tree and tree select | Tri-state check tree, lazy children and a genuine multi-column tree grid |
| Selection transfer | Multi-select exists | Dual-list item selector with transfer, ordering, search, disabled items and keyboard alternatives to drag |
| Feedback | Dialog, validation summary, toolbar status and workflow statuses | Standard alert/confirm/prompt/progress examples, panel loading mask, tooltip/popover and status bar |
| Property/document/business views | Property sheet, totals, activity, attachments, saved filters; optional document entry point | Surface existing examples clearly; distinguish simulated uploads from real persistence |
| Analytics | No exported pivot/chart suite identified | Later pivot summaries and chart integration, with explicit server aggregation limits |
| Scheduling/portals | No calendar/portal component identified | Later calendar and rearrangeable dashboard examples when required by an ERP use case |
| Drag/drop and large datasets | Some column/window operations; bounded paging | Purpose-specific transfer/reorder APIs; virtualization as a separately benchmarked capability |

The Ext gallery also lists data-source variants, remoting, localization, history and offline examples. These are not all missing UI controls. Atlas already has REST/OData adapters and workspace navigation; backend transport formats should not multiply otherwise identical UI demos.

## Showcase structure

Evolve the existing showcase into an example browser inside one workspace task:

- Searchable category navigation: layouts, forms, selection, grids, trees, commands, feedback, business screens, optional analytics.
- Each example has a short purpose, live demo, configuration/API notes, keyboard guidance and reset action.
- Explicit labels for local simulation versus real backend use. Keep actual Customer/quote routes permission-filtered.
- Preserve drafts while switching examples; lazy-create heavier demos. Reset only the selected demo and respect dirty-close rules.
- Include editable, read-only, disabled, loading, empty, validation-error and server-error states. Add compact/comfortable and narrow-width controls to the example shell.
- Keep examples in generated starters; expose reusable controls through `@bqatlas/ui`, never only as showcase-local markup.

## Implementation order

### Batch 1: layout foundation and example browser

Add tabs, fieldsets/accordion and split panes, then extend panel/toolbars with consistent sections. Build a customer-maintenance example: navigation tree + customer list + tabbed details/contacts/history + linked validation. Include responsive behavior, keyboard focus and retained unsaved state. This creates the structure needed by subsequent examples.

### Batch 2: ERP grids and hierarchy (implemented)

Extend the existing table with grouping and summaries. Add grouped header support, check tree and tree grid. Demonstrate an order register grouped by customer/status, a chart of accounts, and a bill-of-materials hierarchy. Use decimal-safe totals and explicit server-total contracts; do not sum a page and label it a dataset total.

### Batch 3: commands and selection (implemented)

Add popup/context menus, split buttons, toolbar overflow and item selector. Demonstrate warehouse assignment, price-list maintenance and record actions. Drag/drop must have equivalent buttons/keyboard operations. Reuse permission-aware command definitions across placements.

### Batch 4: analytics and dashboards (implemented)

Add decimal-safe pivot summaries, small bar/line charts with a data table, drill-down and rearrangeable dashboard panels. The sales example uses bounded local data and explicit aggregation limits.

### Batch 5: planning and editing (implemented)

Add a month calendar with agenda, structured block-based rich-text notes and a fixed-row virtual grid. Delivery plans demonstrate signal forms, retained local drafts and independent task instances; inventory demonstrates 50,000 loaded records with bounded rendering. See [Analytics and planning](ANALYTICS-AND-PLANNING.md) for APIs, keyboard behavior and first-release limits.

## Acceptance for each addition

A reusable exported API; no breaking changes to existing views; component behavior tests; Angular form integration where applicable; keyboard and focus review; two retained task instances without state leakage; compact and comfortable layouts; narrow-screen behavior; explicit data ownership; a starter example and usage documentation. Async controls must retain drafts on errors and reject stale results. Real-data examples enforce permissions on the server as well as in the UI.

Recommended first deliverable: the searchable example browser plus layout/form primitives and a complete customer-maintenance screen. That provides an immediately visible improvement and a consistent home for the grid and hierarchy additions.
