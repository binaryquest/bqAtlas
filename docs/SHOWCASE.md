# Forms and controls showcase

Source: `frontend/projects/erp/src/showcase/`. The samples use the existing Atlas controls; they are not new business modules. The searchable example browser creates demos on first visit and retains them while navigating between examples. It includes density/narrow-preview settings and per-example API/keyboard notes. Purchase-order edits participate in the workspace dirty/save lifecycle.

- Customer maintenance: navigation tree, searchable list, resizable panes, retained customer drafts, details/contacts/history tabs, linked validation, local save/failure/retry and read-only/reset states.
- Layout workbench: reusable tabs, fieldsets/accordion, split panes and panel slots; see [LAYOUT-CONTROLS.md](LAYOUT-CONTROLS.md).
- Master / child: purchase-order master list, header, editable child lines, local save and simulated save failure.
- CRUD forms: permission-filtered links to the actual Customer and Sales quote views; those views use the real backend.
- Multi-column lookup: code/name/city/balance, search, keyboard selection and disabled archived records.
- Selection & inputs: multiselect, autocomplete, checkbox/radio groups, toggle, date/date range, decimal input and validation.
- Advanced tables: 48 sample rows, filtering, multiple sort levels, paging, selection, column visibility/reorder/resize/pinning, expandable details and simulated async queries; plus tree and list controls.
- Business panels: property sheet, totals, activity, simulated attachments and saved filter views.

Sample values are held in memory and reset when the showcase window closes. They do not create production records. Numeric control examples use their original numeric models; the actual Sales quote example remains the reference for exact decimal business amounts. Server paging and upload demonstrations explicitly simulate latency/failures.

## Open the showcase

Run the main sample, sign in, then select **Explore forms & controls** on the home screen or **Forms & controls** in the Start menu. Both launch the same singleton workspace window. The showcase is also included in newly generated starters.

All control examples are available to signed-in users. Links to real CRUD views remain filtered by the account's permissions. Purchase-order edits use the workspace's normal save/discard/cancel flow.

## Batch 2: grouped collections and hierarchy

- **Grouped order register**: customer/status grouping, collapse, header bands, exact USD summaries, local filters and simulated server paging with failure/retry. The page and whole-query totals are labelled separately.
- **Accounts & assemblies**: tri-state account selection, locked accounts, account-balance tree grid, and a bill of materials with delayed child loading and retry. Read-only and reset controls demonstrate state behavior.
- See [Grouped collections API](GROUPED-COLLECTIONS.md) for selection rules, request identity and adapter responsibilities.

## Batch 3: commands and assignment

**Commands & assignment** demonstrates price-list maintenance and warehouse assignment with shared permission-aware commands in toolbar, popup, context-menu and split-button placements. Narrow the task to reveal toolbar overflow. Use the item selector's buttons or Alt+arrow shortcuts, simulate an editing-permission change or failed save, and open two independent tasks to compare retained drafts. See [Commands and selection API](COMMANDS-AND-SELECTION.md).

## Batches 4 and 5

- **Analytics & dashboards:** sales-channel filters, decimal-safe monthly pivots, bar/line charts, order drill-down and panel reorder with keyboard alternatives.
- **Planning & notes:** month calendar and agenda, explicit scheduling, structured notes, read-only and failed-save states, independent plans and dirty-close integration.
- **Virtualized inventory:** 50,000 loaded sample rows, search/warehouse filters, sorting, compact/comfortable row heights, keyboard navigation, record inspection and load-error retry.

These examples are included in generated starters. Their data and drafts are local to each task. See [Analytics and planning](ANALYTICS-AND-PLANNING.md) for exported APIs and limits.

## Batch 6

**Feedback & guidance** opens a local inventory import desk with alert/confirm/prompt dialogs, help tooltip/popover, loading mask, determinate/indeterminate progress, cancellation, failure/retry, notices and status. Open independent imports to compare isolated state. See [Feedback and guidance](FEEDBACK-AND-GUIDANCE.md).

## Related-record workflow

In the running ERP sample, open **Sales quotes → New quote → Customer**. The lookup offers **Search more…** for a paged picker and **Create Customer…** for the normal customer form. **Save & select** returns the customer to the unsaved quote. The adjacent **Open Customer** button opens the selected customer for permitted viewing/editing. Quote lines remain in the parent draft.

Lookup access does not grant full customer read/write access. Quick name-only creation is intentionally unavailable. See [the relational lookup study and implementation notes](ODOO-RELATIONAL-LOOKUP-STUDY.md) for contracts, lifecycle rules and remaining metadata/scaffolding work.
