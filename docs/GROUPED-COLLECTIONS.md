# Grouped collections and hierarchy

Batch 2 adds exported controls to `@bqatlas/ui`. The examples are available in **Forms & controls → Grouped order register** and **Accounts & assemblies**. They use local synthetic data; they do not create business records or implement a production aggregate endpoint.

## Grouped tables

Continue using `AtlasTable` and `AtlasColumn<T>` with existing filtering, multi-sort, column management, selection, row details and paging.

- `groupBy`: optional row property name. Groups are built **after paging** and preserve first appearance and within-group sort order. One customer may appear on several pages. This is page grouping, not server-side grouping or pagination by groups.
- `collapsedGroups`: two-way string array of raw group keys. Collapse affects visibility only; page selection, record counts and totals still include hidden rows. Switching group fields retains keys; clear this model when the application requires a fresh view.
- `AtlasColumn.group`: optional header band label. Spans are recomputed from actual visible/pinned column order. Moving a column can split a band into multiple contiguous runs. Band rows scroll horizontally with the table; leaf headers retain existing pinning.
- `summaries`: `{ key, label, aggregate(rows): string }[]`. Functions must be pure. Group footers explicitly say **page subtotal**. The footer separates **Page total** from **Filtered total · all matching records**. Hidden columns do not remove summary definitions.
- `atlasSumDecimal(values, scale=2)`: signed canonical decimal strings → exact string, using integer arithmetic. Rejects invalid precision rather than silently rounding. Sum one currency/unit at a time; the caller owns conversion and rounding policies.

```ts
columns = [
  { key: 'customer', label: 'Customer', group: 'Order details' },
  { key: 'net', label: 'Net · USD', group: 'Amounts', align: 'right' },
];
summaries = [{
  key: 'net', label: 'Net USD',
  aggregate: rows => atlasSumDecimal(rows.map(row => row.net)),
}];
```

### Whole-query totals with server paging

The table never infers a whole-query total from server page rows. Supply `serverSummary` only when the adapter has a verified aggregate for the same request:

```ts
const request = query; // from queryChange
serverSummary.set({
  scope: 'query',
  queryKey: atlasSummaryQueryKey(request),
  values: { net: response.filteredNet },
});
```

The request key includes page, page size, search, sorted filter keys and ordered sort levels. A mismatch hides the aggregate with **Not supplied for this request**. Missing values say **Unavailable**. Loading/errors hide all summaries. Echo the original request token, reject stale responses (for example with `AtlasLatestRequest`), and clear the response when permissions, tenant, data revision or other adapter context changes. The token is a UI consistency check, not an authorization boundary. The backend must apply the same authorized predicate to rows, count and aggregate. Currency/scale/snapshot consistency remains the adapter's responsibility.

## Check tree

`AtlasCheckTree` consumes `AtlasTreeNode[]`. `checkedIds` stores **leaf IDs only**. Parent state is derived, not stored. Checking a partially selected branch selects all enabled loaded leaves; checking a fully selected branch clears them. Disabled subtrees are excluded. IDs must be unique and stable within a tree.

An enabled branch with `hasChildren: true` and `children: undefined` is unloaded. Its check operation, and checking any ancestor containing it, is disabled until all enabled descendants are known. Already checked loaded descendants remain visible as mixed state. `children: []` means a successfully loaded empty branch. Do not use a partial children array to imply a fully loaded paged branch; load the full selectable subtree or implement a separate backend selection contract.

Inputs: `nodes`, `label`, `disabled`, `readonly`. Models: `checkedIds`, `expandedIds`. Native checkbox affordances accompany ARIA tree items. Read-only permits browsing/expansion; disabled blocks actions. Arrow keys traverse visible nodes and expand/collapse; Home/End move to boundaries; Space/Enter check. Tab exits the tree.

## Tree grid and lazy nodes

`AtlasTreeGrid` uses the same nodes and expansion model, with `hierarchyLabel` and `columns: { key, label, align? }[]`. Additional cell text comes from `node.values`. `selectedId` and `nodeSelected` expose row selection; Enter/Space select. Navigation uses one row tab stop with Left/Right for hierarchy and Up/Down/Home/End for visible rows. It is a read-only data presentation, not an editable grid. Parent financial values are supplied by the application, not automatically summed with children.

Both new controls emit `loadChildren(node)` on expansion of an unloaded branch. The adapter must synchronously mark that node `loading: true`, fetch children, then replace the node immutably with `children` and `loading: false`. On failure, set `error` and clear loading; Retry or Enter emits another request. Loaded children and expansion state survive collapse. The adapter owns per-node cancellation, stale-result rejection, reset/disposal and authorization. The BOM demo has one lazy branch and uses `AtlasLatestRequest`; applications with concurrent branch loads should keep a request controller per node.

Each control's models and focus state belong to that instance. Share a model explicitly only when synchronized views are intended. Tables scroll within their own container on narrow screens. The controls inherit Atlas density and theme variables.
