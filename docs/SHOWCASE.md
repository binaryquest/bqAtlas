# Forms and controls showcase

Source: `frontend/projects/erp/src/showcase/`. The samples use the existing Atlas controls; they are not new business modules. The sample window retains each section while navigating between examples. Purchase-order edits participate in the workspace dirty/save lifecycle.

- Master / child: purchase-order master list, header, editable child lines, local save and simulated save failure.
- CRUD forms: permission-filtered links to the actual Customer and Sales quote views; those views use the real backend.
- Form layouts: supplier onboarding, collapsible accordions, grouped fields and a live summary.
- Multi-column lookup: code/name/city/balance, search, keyboard selection and disabled archived records.
- Selection & inputs: multiselect, autocomplete, checkbox/radio groups, toggle, date/date range, decimal input and validation.
- Advanced tables: 48 sample rows, filtering, multiple sort levels, paging, selection, column visibility/reorder/resize/pinning, expandable details and simulated async queries; plus tree and list controls.
- Business panels: property sheet, totals, activity, simulated attachments and saved filter views.

Sample values are held in memory and reset when the showcase window closes. They do not create production records. Numeric control examples use their original numeric models; the actual Sales quote example remains the reference for exact decimal business amounts. Server paging and upload demonstrations explicitly simulate latency/failures.

## Open the showcase

Run the main sample, sign in, then select **Explore forms & controls** on the home screen or **Forms & controls** in the Start menu. Both launch the same singleton workspace window. The showcase is also included in newly generated starters.

All control examples are available to signed-in users. Links to real CRUD views remain filtered by the account's permissions. Purchase-order edits use the workspace's normal save/discard/cancel flow.
