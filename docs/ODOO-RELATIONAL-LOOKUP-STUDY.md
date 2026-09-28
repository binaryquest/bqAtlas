# Odoo relational lookup study and bqAtlas proposal

Studied 2026-09-28 against Odoo's `19.0` source branch and bqAtlas commit `3681903`. The original proposal is followed by an implementation update at the end of this document. This is a focused review of related-record selection and navigation, not an audit of the whole Odoo framework. The findings below come from official documentation, source and templates. The documentation loaded after an initial timeout; an interactive Odoo application was not tested. Source links target a moving branch.

## Recommendation

Add a reusable relational lookup to bqAtlas: search/select an existing record, expand to a full picker, create through the registered record form, and open the selected record. Preserve Atlas's multi-column lookup and task-window design. Ordinary enum selects should remain simple selects.

Start with a real Sales quote → Customer workflow. It exercises cross-module lookup, required customer fields, authorization, concurrent editing and an unsaved parent with line items. This is more valuable than adding another disconnected control demonstration.

## What Odoo actually provides

The official [Studio field documentation](https://www.odoo.com/documentation/19.0/applications/studio/fields.html#many2one-many2one) describes many-to-one fields as links to another record and exposes creation/opening restrictions, domain filtering and a minimum search length. It distinguishes these references from embedded lines and multiple-record relations.

Odoo distinguishes creation, quick creation, form-based creation and opening an existing relation. These can be configured separately, with create/write inputs affecting available actions. See the official [many-to-one field options](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/fields/many2one/many2one_field.js).

The autocomplete searches within a supplied domain/context, handles stale requests, offers creation actions and can launch “Search more.” Typed text can seed the creation form; a quick-create validation failure can fall back to full form creation. See [relational utilities](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/fields/relational_utils.js).

Opening an existing relation is also an adjacent icon or a link in the read-only field. The template chooses navigation or a dialog according to context; it does not always open a modal. See the [field template](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/fields/many2one/many2one.xml). The [component](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/fields/many2one/many2one.js) supports action/dialog/tab opening and refreshes the selected record's display name after dialog saves.

The [selection dialog](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/view_dialogs/select_create_dialog.js) reuses a view, carries filters/context, and returns selected IDs. The [form dialog](https://github.com/odoo/odoo/blob/19.0/addons/web/static/src/views/view_dialogs/form_view_dialog.js) reuses the form view and provides saved/closed callbacks. Reusing one record form is the most useful architectural lesson for Atlas.

We should implement these interaction ideas in native Atlas components, without copying Odoo code, styles or assets into the MIT project.

## Fit with the existing code

| Existing foundation | Missing capability |
| --- | --- |
| [AtlasLookup](../frontend/projects/ui/src/lib/lookup.ts): stable key, display label, remote multi-column results, keyboard selection, paging and loading/error states | Separate action area for Search more/Create, and an accessible selected-record Open action |
| [ReferenceLookup](../frontend/projects/angular/src/reference-lookup.ts): provider query, debounce and stale-request cancellation | Context-aware reload, selected-ID resolution, related-record actions and proper read-only/touched integration |
| [Contracts](../frontend/projects/contracts/src/index.ts): lookup query and CRUD providers; reference field type | Lookup resolve-by-ID contract and optional reference-target metadata; the existing reference type alone does not generate this workflow |
| [CrudWorkspace and editor](../frontend/projects/angular/src/crud.ts): registered resource forms, validation, versioned saves, dirty state | A correlated saved/selected/cancelled result; `openEditor` currently returns no result and `changed()` only signals global refresh |
| [Workspace](../frontend/projects/ui/src/lib/workspace.ts): origin task, lifecycle and dirty-close handling | Safe result delivery to the invoking field; keyed task reuse must not hijack another caller's editor |
| [Quote editor](../frontend/projects/erp/src/sales/quote-views.ts): customer lookup and editable line aggregate | Create/open/return flow with the original quote draft and lines retained |
| [CRM endpoints](../samples/erp/server/Modules/Crm/CrmModule.cs): separate lookup/read/write permissions and concurrency headers | Minimal, permission-safe lookup resolution and the integration acceptance cases below |
| [Resource generator](../frontend/projects/cli/bin/lib/generate-resource.mjs): scalar resources and explicit extension points | Reference scaffolding after the first runtime integration proves the contract |

This belongs across the existing layers, not entirely inside a dropdown:

- `@bqatlas/ui`: presentation, keyboard/focus behavior and typed action events; no resource registry, HTTP or ASP.NET dependency.
- `@bqatlas/contracts`: transport-neutral lookup context/resolution and result shapes. Keep metadata serializable; application callbacks belong in runtime registrations.
- `@bqatlas/angular`: registered resource selection, editor orchestration, permission checks and return-to-field lifecycle.
- CRM/Sales modules: minimal projections, eligibility rules, defaults and business validation.

The generic editor currently depends on a workspace task. Reusing it inside a modal requires extracting a shared controller/body; simply mounting the task editor inside a dialog would retain the wrong lifecycle assumptions. Start with an owned workspace task for the full customer form. A compact dialog can follow once both surfaces share that editor implementation. Use a full-screen child view on mobile with a clear return path.

## Proposed user experience

| Action | Proposed behavior |
| --- | --- |
| Search | Debounced server query; show code/name columns, loading, empty and retry states. Keep ID separate from caption. |
| Search more… | Open a paged picker retaining the current search and allowed filters. Selecting returns to the original field. |
| Create customer… | Open the registered customer form. Seed the name from typed text and only explicitly allowed defaults from the parent context. |
| Save & select | Persist the customer, resolve its eligible lookup summary, then select it in the invoking quote. Keep the quote unsaved. |
| Open selected customer | Adjacent, labeled, keyboard-accessible action. Open read-only or editable according to record access. Return to the quote with focus restored. |
| Cancel or close child | Leave the parent value and draft unchanged; retain the standard dirty-close confirmation for unsaved child edits. |
| Read-only parent | Prevent changing the reference, but allow opening the selected record when read access permits it. |

Use a visually separated action footer beneath results. Do not style actions as selectable record rows or mix them into the grid's row count. Close the lookup popover before opening the picker/editor. Define keyboard order explicitly, including access to footer actions, Escape behavior and focus restoration. Avoid unlimited nested dialogs; complex related forms should use workspace navigation.

**Quick creation should be off by default.** Our customer requires both Code and Name, and other ERP masters often need tax, company or accounting data. A name-only create is therefore a poor default. Later, a resource may explicitly opt in when its backend can produce a valid record with safe defaults. Never create implicitly on blur. Do not add Delete to the lookup menu.

## Correctness and access rules

### Preserve the parent and identify the caller

A request needs a unique invocation ID, parent task ID, stable field/line identity, field revision and context/session generation. Deliver the result only if that caller still exists and its reference/context has not changed. A late save must not overwrite another customer selected while the child was open, update the wrong line after reordering, or repopulate a closed/logged-out task.

`WorkspaceService.open` currently reuses keyed editors. Two parents opening the same customer must not overwrite each other's callback or take ownership of an already dirty editor. The first implementation should use a distinct invocation-owned editor, or explicitly implement independently cancellable result subscriptions before sharing one. Backend version checks handle independent concurrent editors.

Editing an existing customer can refresh the displayed lookup caption, but must not silently rewrite business snapshots, pricing or other dependent values. The current quote keeps customer code/name in its draft and maps them in `chooseCustomer`; any refresh policy must distinguish display-only updates from intentionally changing that draft. Sales remains responsible for its own business effects.

### Preserve authorization boundaries

The sample grants lookup access separately from full customer read access. A user may select customers without being allowed to open their complete records. Therefore:

- Search more must use the same minimal lookup projection and eligibility rules, not automatically use the full CRUD query or OData entity view.
- Resolve-by-ID must use lookup permission and the same scoped projection; do not fall back to the full GET endpoint for lookup-only users.
- Open requires read access; Create/Edit require the endpoint's read/write permissions and record capabilities. Client action visibility is convenience; endpoints remain authoritative.
- Keep field mutability separate from permission to open a related record. The current generic editor's disabled fieldset and combined disabled/read-only state need adjustment so navigation remains available without allowing edits.
- Context filters are query inputs, not authorization. Enforce allowed filters and record scope on the server, including during parent save.

Context changes must invalidate in-flight requests immediately, clear inappropriate results and revalidate the selected ID. Any summary cache must include resource, ID, relevant context and session/access generation, and clear when those change. A previously selected inactive/unavailable record needs an explicit unavailable state; do not silently substitute another record or expose data beyond lookup permission.

### Make transaction boundaries explicit

Creating a customer commits a CRM record independently. Cancelling the quote later does not delete that customer. Creating embedded quote lines is a different aggregate operation and should not use this immediate-save master-record flow.

A failed or conflicting child save leaves its draft available and the parent unchanged. If the save succeeds but the record no longer satisfies the parent's lookup context, report that it was saved but could not be selected. Do not silently retry creation after an ambiguous network failure and risk duplicates.

Sales already validates the customer through `ICustomerDirectory` and rejects inactive references. Preserve that module contract instead of adding cross-module database access. Revalidate at parent save even after client selection.

## Backend and package direction

This feature needs no SQL Server-specific or PostgreSQL-specific UI logic. Add lookup-resolution behavior through the owning module and test both providers. REST and OData adapters can satisfy the same frontend contract without exposing full entities to lookup-only users. Resolve endpoint shape and context schema should be finalized with the implementation, not assumed to exist today.

The frontend contracts should remain independent of EF Core, ASP.NET Identity and .NET types. A future Rust backend can implement the same HTTP/projection/error/version contracts. Local authentication and external OIDC both feed the existing session permissions; the control should not branch on the identity provider.

Keep this within the existing UI/contracts/Angular/backend packages. No new package or registry publication is needed to validate the feature.

## Delivery sequence

1. **First vertical slice:** Sales quote customer lookup with Search more, Create, Open, Save & select, cancel, focus restoration, scoped resolution and guarded result delivery. Reuse the customer editor and preserve the quote's lines and dirty state. Add a discoverable working example in the starter.
2. **Reusable reference fields:** Generalize the proven behavior into resource registrations and optional manifest metadata; integrate generic CRUD rendering and extend the resource generator with explicit reference configuration and tests.
3. **Later additions:** Opt-in quick create, multi-record selection/tag navigation, and separately designed child-aggregate editing. Avoid treating many-to-many or unsaved one-to-many records as identical to a saved master reference.

## Acceptance checks for implementation

| Case | Expected result |
| --- | --- |
| Search, paging and rapid query/context changes | Latest eligible results only; bounded server queries; no stale overwrite |
| Select from Search more | Correct ID/caption returned; parent draft and line items retained |
| Create valid customer and Save & select | Customer persists once; eligible summary selected; quote remains unsaved |
| Validation failure, cancel or discard child | Parent reference remains unchanged; appropriate child errors/close behavior |
| Open/edit selected customer | Versioned update; correct return focus; no implicit mutation of quote business snapshots |
| Lookup-only account | Selection/search work; full-record opening and creation unavailable; direct endpoint attempts rejected |
| Read-only quote with customer read access | Customer can be opened; quote reference cannot be changed |
| Parent changed/closed, line reordered, context changed or logout | Late result cannot mutate an unrelated or expired caller |
| Two quotes open the same customer | No callback hijack or dirty-editor takeover; stale updates show a conflict |
| Customer becomes inactive/deleted | Explicit unavailable handling; parent backend rejects invalid reference |
| Keyboard and mobile | Search, actions, selection, return and cancellation usable without pointer; no focus loss |
| SQL Server/PostgreSQL and local/OIDC sessions | Equivalent projection, validation, access and concurrency behavior |

Use unit tests for result correlation, context invalidation and action availability; API integration tests for lookup projection/authorization and parent validation; and browser tests for the end-to-end draft-preserving workflow. A mock showcase alone is not sufficient evidence that this feature works.


## Implementation update — first workflow

The source now implements lookup footer actions, a paged selection dialog, independent related customer editor tasks, explicit Save & select, and lookup-scoped customer resolution. The quote retains its unsaved lines; editing its currently selected customer refreshes the visible caption without rewriting quote snapshots. Read-only quotes can open the customer if permitted. Return callbacks check parent lifetime, field revision, lookup context and session identity, and are cancelled on disposal.

The reusable `ReferenceLookup` accepts `resource` and optional `nameField`; its provider must implement `resolve(id, signal)` for related editing. `contextKey` invalidates pending work; it is not a server filter or authorization boundary. This first sample uses the CRM active-customer projection. Custom CRUD editor components must explicitly gain result support before they can be used with `openRelated`; the generic customer editor is supported now.

Generic reference metadata/scaffolding, configurable eligibility context transported to servers, quick creation and multi-record/aggregate relations remain later stages. Existing field actions require no package publication.

Local verification: production frontend build; frontend regression suite including independent editor identity, access restrictions, cancelled/stale results and caption refresh; 38 backend unit tests; 31 PostgreSQL integration tests including minimal lookup projection, full-record denial and inactive/missing ID resolution. Browser checks covered create validation, Save & select, retained quote lines/total, expanded selection, opening/editing the selected customer and caption refresh. The review preview uses an isolated local database. SQL Server verification is delegated to the repository's database CI job.
