# Analytics, planning and large collections

Batch 4 adds native Angular pivot, chart and dashboard controls. Batch 5 adds a calendar, structured rich-text editor and fixed-row virtual grid. All are exported by `@bqatlas/ui`; no Ext JS source, assets or runtime are included.

Open **Forms & controls** and choose **Analytics & dashboards**, **Planning & notes**, or **Virtualized inventory**. Examples are included in generated starters and use synthetic local data. They do not write business records.

## Pivot and charts

`AtlasPivotTable<T>` receives `records`, `row`, `column`, and `measure` selector functions, plus `scale`, `rowLabel` and `label`. Measures are canonical signed decimal **strings**. `atlasPivot` and `atlasSumDecimal` preserve exact totals with integer arithmetic, including amounts beyond JavaScript's safe integer range. Excess fractional precision is rejected rather than rounded. Empty cells sum to zero. `cellSelected` emits `{ row, column }` for caller-owned drill-down.

The component accepts at most 50,000 source records, 500 row groups and 24 column groups, checked before building the result matrix. The standalone `atlasPivot` helper has no presentation limits; callers must bound its dimensions. Totals cover only supplied records. For a paged API, request server aggregates for the same filter; never label one loaded page as a dataset total.

```ts
readonly region = (order: Order) => order.region;
readonly month = (order: Order) => order.month;
readonly amount = (order: Order) => order.netAmount; // decimal string
```

```html
<atlas-pivot-table [records]="orders()" [row]="region"
  [column]="month" [measure]="amount" label="Net sales · USD"
  (cellSelected)="openOrders($event)" />
```

`AtlasChart` accepts `{ id, label, value: number }[]` in `points`, `type="bar" | "line"`, and a label. `selected` is a point-ID model; `pointSelected` emits the point. It supports signed values, a zero baseline, keyboard Enter/Space selection, full accessible labels and a data-table disclosure. It shows at most 24 finite points and reports omitted points. Numeric chart geometry is approximate: use the exact pivot/table for financial values. This is a small single-series chart, not a full analytical charting suite.

## Dashboard panels

```html
<atlas-dashboard [(order)]="panelOrder">
  <ng-template atlasDashboardPanel="sales" title="Sales">
    <atlas-chart [points]="salesPoints()" />
  </ng-template>
  <ng-template atlasDashboardPanel="totals" title="Totals">...</ng-template>
</atlas-dashboard>
```

Panel IDs must be stable and unique. `order` belongs to the application. Unknown/duplicate order IDs are removed and newly available panels are appended. Dragging the handle reorders a panel; Earlier/Later buttons provide the same operation without drag. Templates move with their retained view state. The showcase keeps positions for its task lifetime and offers Reset panel layout. No browser storage or server persistence is implied.

## Calendar

`AtlasCalendar` has `month` (`YYYY-MM`) and `selectedDate` (`YYYY-MM-DD`) models, `events`, `weekStartsOn` (0 Sunday / 1 Monday), `disabled` and `label` inputs, and `eventSelected` output. Events have unique `id`, `title`, `date`, optional inclusive `endDate`, and optional `description`.

Dates are calendar dates rather than instants. Helpers use UTC arithmetic to avoid DST changes; supported years are 0001–9999. Invalid and reversed event ranges are ignored. A six-week month grid shows event counts and the selected day's agenda. Arrows move one day/week; Home/End move within the week; PageUp/PageDown change months while clamping the day. Previous/Next month buttons browse without changing selection. There is no timed booking, timezone conversion, recurrence or drag scheduling in this release.

The delivery example explicitly schedules its draft on the selected day. Each independent plan has its own calendar, draft and save state. Calendar browsing alone does not dirty the plan.

## Structured rich text and draft lifecycle

`AtlasRichText` implements Angular signal-forms `FormValueControl<AtlasRichDocument>`. Bind `[formField]` or its `value` model. Supply `controlId` and `label`; disabled, readonly, invalid, touched and describedBy states follow the shared Atlas choice-control contract.

The value is `{ blocks: [{ id, kind, text, bold?, italic? }] }`, where `kind` is paragraph, heading or bullet. IDs must be unique. Users add, remove and reorder blocks, change the block type, and apply whole-block emphasis. Textareas edit plain text and a formatted preview renders it through Angular interpolation. HTML entered as text remains text. There is no raw-HTML import/export, inline selection formatting, arbitrary styling, link/media embedding or rich clipboard import. Applications can use `atlasRichText` for a plain-text representation.

The planning sample's store validates title/date/nonempty notes, snapshots saves, retains failed drafts, rejects stale completion after reset/disposal/read-only changes, and prevents a late response from replacing newer edits. Local save participates in task dirty-close handling. Use the same lifecycle with application APIs and server-side authorization for real plans; the sample's read-only toggle is not an authorization boundary.

## Virtual grid

```html
<atlas-virtual-grid [rows]="filteredRows()" [columns]="columns"
  keyField="id" label="Inventory" [height]="400" [rowHeight]="32"
  [(selectedKey)]="selection" [loading]="loading()" [error]="error()"
  (retry)="reload()" (rowActivated)="openRecord($event)" />
```

`AtlasVirtualGrid<T>` reuses `AtlasColumn<T>` key, label, width, format and alignment. Rows need stable unique keys. It renders fixed-height text cells with ellipsis and full title text, not cell templates. Default height is 360px and row height 36px; supported heights are 160–800px and row heights 24–80px. Four overscan rows surround the viewport. `atlasVirtualRange` is the exported range helper. The wrapper exposes total row count, absolute row indexes and its active descendant; arrows, PageUp/PageDown and Home/End select, Enter activates, and double-click activates a record.

This is virtualization of an **already loaded array**, not an infinite remote data source. Filtering and sorting belong to the caller. Replacing rows or changing row height resets the scroll position; selection remains a stable key and is inactive when absent. Loading, empty and retryable-error states are explicit. The 50,000-row example uses fixed 32/44px rows; this does not establish a universal performance guarantee for every device or dataset size. Variable-height rows, editable cells, grouped rows, column menus and server paging remain separate capabilities of the existing table/editor controls.

## Validation

`frontend/tests/analytics-planning.test.mjs` covers exact aggregation, chart domains, dashboard ordering, calendar boundaries and event ranges, immutable structured text, virtual range/keyboard behavior, and draft isolation/failure/stale-save handling. Generated starters include the same test file. Browser review covers desktop and narrow layouts, chart drill-down, panel reorder, calendar keyboard navigation, structured notes, independent task drafts and the final record of a 50,000-row grid.
