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

The new components and templates compile independently. A complete isolated application build passes in `/tmp/bqatlas-showcase-preview`. Browser checks on port 4201 verified the purchase reference dirty state/local save, multi-column keyboard selection, radio/checkbox interaction, table warehouse filter and row selection, and supplier form review. Existing user work on port 4200 was not reloaded.

Integration into the primary Start menu/home launcher is prepared in `docs/patches/showcase-launcher.patch`; apply after the user confirms their current draft is safe to reload. The separate preview already includes that integration. Local package archives have not been refreshed for these UI follow-ups.
