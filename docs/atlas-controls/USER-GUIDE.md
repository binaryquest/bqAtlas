# Atlas UI control guide

Generated from `docs/atlas-controls/catalog.json`, the same content used by the showcase. Run `npm run docs` after editing it.

All controls are R&D previews. New ERP controls use native Signal Forms; original controls retain reactive-form compatibility.

## Quotes datasheet

Access-inspired continuous cell editing in a master/detail quote form. Every cell edits a signal-backed draft; Save commits the form and Cancel restores its last saved snapshot.

### Using the control

1. Edit customer and reference, then type directly into any line cell. No per-row Edit or Apply step is needed.
2. Open a product cell to compare code, product, unit, stock and price. Selecting it stores its key and fills the editable unit price.
3. Add line creates an empty product row. Remove changes only the draft; Cancel restores removed lines and all other edits.
4. Save validates the complete quote. Correct highlighted rows and retry. Simulate next save failure retains the draft after an API failure.
5. Drafts survive category and documentation switches. A dirty workspace window uses the existing unsaved changes guard. Data resets on gallery disposal or reload.
6. On small screens the sheet scrolls horizontally; touch targets follow the workspace density.
7. For another view, reuse AtlasDatasheet from @bqatlas/ui and supply your own columns and signal-backed draft store. The repository guide docs/atlas-controls/DATASHEET-INTEGRATION.md contains a complete inventory-count component, lookup integration, and an AI implementation checklist.

### Keyboard

- Tab / Shift+Tab move between editors, wrapping across rows. At the boundary normal Tab exits the sheet.
- Up / Down move to the same column in the previous / next row without changing numeric values. Enter in an input moves down; Shift+Enter moves up.
- Alt+Down or F4 opens a product lookup; Enter and Space also activate its button. Inside the popup arrows highlight, Enter selects, and Escape dismisses.
- Left / Right move to the previous / next enabled editor in the same row, skipping read-only cells. They stop at row boundaries; Tab wraps rows. Shift+Left / Right retains native text selection. Ctrl/Cmd+Home / End focus the first / last editor.

### API

| Property | Type | Description |
| --- | --- | --- |
| AtlasDatasheet | table[atlasDatasheet] directive | Native table navigation. Consumer owns draft, validation, and persistence. |
| data-sheet-editor | DOM marker | Mark one native editor or AtlasLookup host per editable cell. Disabled editors are skipped. Keep the same logical columns across rows. |
| AtlasLookup.arrowNavigation | "open" \| "grid"; default "open" | Use grid so plain vertical arrows bubble to the table. Alt+Down/F4 still open the lookup. |
| Table structure and scroll wrapper | Integration contract | Use one tbody with stable column positions. The immediate parent must have overflow:auto. Mark one primary editor per editable td; leave derived/read-only cells unmarked. Use page-unique lookup IDs. |

### Example

```ts
// Reuse the exported directive, not the quote component.
// Import AtlasDatasheet in your standalone component imports.
// Complete signal-based inventory example and lookup recipe:
// docs/atlas-controls/DATASHEET-INTEGRATION.md
<div style="overflow: auto; max-height: 420px">
  <table atlasDatasheet aria-label="Order lines">
    <thead><tr><th scope="col">Note</th></tr></thead>
    <tbody>@for (line of lines(); track line.id) {
      <tr><td><input data-sheet-editor [value]="line.note"
        [attr.aria-label]="'Note, line ' + line.id"
        (input)="updateNote(line.id, $any($event.target).value)" /></td></tr>
    }</tbody>
  </table>
</div>
```

### Current limits

- Local nonvirtualized data only. No range selection, clipboard matrix paste, undo history, or Excel formulas.
- The quote uses signals and native inputs, not a general quote schema or persistence service. Totals round per line; no tax or production decimal arithmetic.
- Mobile currently preserves table columns with horizontal scrolling rather than a separate line-card editor.

## Multi-column lookup

Choose a business record using several columns while storing only its stable key. Useful for customer, product, warehouse, account, and invoice selection.

### Using the control

1. Open the field to compare code, name, city, and balance. On a phone, each row shows those values with labels.
2. Search any configured searchable column. Multiple words must all match the same record.
3. Click a row or press Enter to commit it. The field displays the customer name; the model stores its ID.
4. Use Clear to remove the selection. Searching or pressing Escape never commits the highlighted row.
5. Archived rows are disabled. Loading, failed requests with Retry, and no matches each have a separate state.

### Keyboard

- Tab focuses the field; Enter, Space, or an arrow key opens it.
- The search field retains keyboard focus. Up/Down move through enabled records; Home/End select the first/last highlight.
- Enter commits the highlighted record. Escape dismisses and returns focus. Tab dismisses and moves onward.
- When results fail to load, Tab moves from search to Retry; Shift+Tab returns to search. Retry returns focus to search.

### API

| Property | Type | Description |
| --- | --- | --- |
| rows | readonly T[] | Source records. Each record must have a unique non-null key. |
| columns | AtlasLookupColumn<T>[] | key, label, optional width in px, alignment, format(row), and searchable flag. |
| recordKey / displayWith | (row: T) => key / string | Return the stored string/number key and human-readable selection text. |
| value / valueChange | V \| null | Two-way model; null represents no selection. |
| formField | FormField directive | Connect a Signal Forms field. Import FormField from @angular/forms/signals. |
| rowDisabled | (row: T) => boolean | Prevents pointer and keyboard selection of a record. |
| disabled / readonly | boolean inputs | Disabled blocks focus; readonly allows focus but blocks edits. |
| loading / error / retry | boolean / string / output<void> | Consumer owns data requests. Retry emits a request to the consumer. |
| popupWidth | number, default 640 | Preferred width, clamped to viewport. Results adapt below 460px. |
| recordSelected | output<T \| null> | Committed record, or null after clearing. |
| controlId / ariaLabel / describedBy | string | Unique ID, accessible name, optional help/error element ID. |
| invalid / touched / required | boolean inputs | Signal Forms supplies these. Invalid styling appears after touch. |
| arrowNavigation | "open" \| "grid", default "open" | In grid mode plain Up/Down navigate the containing datasheet. Alt+Down/F4 open the popup. |

### Example

```ts
// Imports: signal from @angular/core; form, FormField, required from @angular/forms/signals;
// AtlasLookup, AtlasLookupColumn from @bqatlas/ui. Add FormField and AtlasLookup to component imports.
interface Customer { id: string; name: string; city: string; }
model = signal({ customerId: null as string | null });
fields = form(this.model, s => required(s.customerId));
customers: Customer[] = [{ id: 'C-001', name: 'Acme Studio', city: 'Dhaka' }];
columns: AtlasLookupColumn<Customer>[] = [
  { key: 'id', label: 'Code', width: 90 },
  { key: 'name', label: 'Customer' },
  { key: 'city', label: 'City', width: 110 },
];
key = (row: Customer) => row.id;
label = (row: Customer) => row.name;

<atlas-lookup controlId="customer" ariaLabel="Customer"
  [rows]="customers" [columns]="columns"
  [recordKey]="key" [displayWith]="label"
  [formField]="fields.customerId" />
```

### Current limits

- Local single selection only. Remote query output, server paging, virtualization, sorting, and editable popup cells are planned.
- Keys must be unique strings or numbers; null is reserved for an empty value. Missing selected records show an unavailable-record label and retain the key.
- Use [formField] OR [(value)], not both on the same instance. Existing CVA controls use their existing forms contract.
- Modern browser Popover API is required. Screen-reader and multi-browser qualification remains outstanding.

## Text area

Enter longer notes with a character counter and Signal Forms validation.

### Using the control

1. Type delivery instructions. The example allows up to 160 characters.
2. The count updates immediately. Resize vertically if you need more room.
3. Reset restores the initial value; disabling or making the form read-only prevents changes.

### Keyboard

- Tab focuses the textarea. Enter creates a new line. Tab leaves the field and marks it touched.

### API

| Property | Type | Description |
| --- | --- | --- |
| value | model<string> | Two-way text value; default empty string. |
| formField | FormField directive | Binds the signal field and its validation/availability state. |
| rows / showCount | number / boolean | Default 4 visible rows and visible character count. |
| maxLength | number \| undefined | Native entry limit; Signal Forms can supply it from a schema. |
| controlId / ariaLabel / describedBy | string | Unique ID, accessible name and help/error association. |
| disabled / readonly / invalid / touched | boolean inputs | Availability and validation styling. |
| touch | output<void> | Emitted when focus leaves the native textarea. |

### Example

```ts
// Imports: AtlasTextarea and FormField in the component.
notes = signal({ text: '' });
fields = form(this.notes, s => maxLength(s.text, 160));

<atlas-textarea controlId="notes" ariaLabel="Delivery notes"
  [formField]="fields.text" />
```

### Current limits

- Plain text only; rich text, automatic height growth and mention/tag editing are planned.
- Native maxlength uses UTF-16 code units, not user-perceived Unicode grapheme counts.

## Toggle switch

Set an immediate on/off preference, such as delivery notifications. Use a checkbox rather than a switch for a mandatory agreement.

### Using the control

1. Click the switch or its label to change the preference.
2. The switch uses the same signal model as the lookup and notes.
3. Read-only prevents changes while keeping it focusable; disabled prevents interaction.

### Keyboard

- Space or Enter toggles the focused switch. Tab moves to the next control.

### API

| Property | Type | Description |
| --- | --- | --- |
| checked | model<boolean> | Two-way boolean state, default false. |
| label / controlId | required string inputs | Visible accessible label and unique ID. |
| formField | FormField directive | Connects a boolean Signal Forms field. |
| disabled / readonly | boolean inputs | Prevent interaction or editing. |
| touch | output<void> | Emitted when focus leaves the switch. |

### Example

```ts
// Imports: AtlasToggle and FormField in the component.
preferences = signal({ notify: true });
fields = form(this.preferences);

<atlas-toggle controlId="notify" label="Send delivery notifications"
  [formField]="fields.notify" />
```

### Current limits

- Boolean only; no indeterminate state. Checkbox/radio groups are available in Selection & entry.

## Text, password and number inputs

Compact form fields for references, email addresses, passwords, and amounts. Existing controls integrate with reactive forms through ControlValueAccessor.

### Using the control

1. Use Full name clear to remove the value, then Validate form to see required feedback.
2. Show/Hide reveals or masks the password.
3. Use the number step buttons or type an amount. Validators enforce the allowed range; prefixes/suffixes are display-only.
4. Reset restores the initial sample; Disable controls demonstrates form availability.

### Keyboard

- Native input editing and Tab navigation apply.
- Number step buttons can be activated with Enter or Space.

### API

| Property | Type | Description |
| --- | --- | --- |
| AtlasTextInput | standalone component | type, icon, prefix, suffix, clearable, autocomplete, maxLength. |
| AtlasNumberInput | standalone component | min, max, step, prefix, suffix, showButtons. |
| controlId / ariaLabel | string | Unique native control ID and accessible name. |
| formControl / formControlName | Angular reactive forms | CVA propagates values, disabled state and touched status. |
| invalid / describedBy / readonly | inputs | Application supplies validation state, help association and readonly state. |

### Example

```ts
// Imports: ReactiveFormsModule, AtlasTextInput, AtlasNumberInput.
reference = new FormControl('');
amount = new FormControl<number | null>(0);

<atlas-text-input controlId="ref" ariaLabel="Reference" [formControl]="reference" [clearable]="true" />
<atlas-number-input controlId="amount" ariaLabel="Amount" [formControl]="amount" [min]="0" [step]="0.5" />
```

### Current limits

- These original controls retain CVA APIs; native model/Signal Forms migration is planned. They already work in the zoneless gallery.
- Signal-based decimal/currency and native date-range controls are available in Selection & entry. Masks remain planned.

## Select

Choose one value from a short list with optional descriptions and groups. Use the multi-column lookup when records need comparison across several fields.

### Using the control

1. Open Department and search Finance or another name.
2. Choose an option to commit its value. Clear removes the value and Validate selection demonstrates required feedback.
3. Archived options cannot be chosen; readonly and disabled examples demonstrate their differences.

### Keyboard

- Up/Down navigate enabled choices; Home/End jump to first/last.
- Enter selects; Escape closes; Tab dismisses.

### API

| Property | Type | Description |
| --- | --- | --- |
| options | AtlasOption<T>[] | label, value, optional description, group, disabled. |
| filter / clearable | boolean, default true | Search box and clear action. |
| loading | boolean | Blocks opening while pending. |
| formControl / formControlName | Angular reactive forms | Stores the option value, not its display label. |
| controlId / ariaLabel / invalid / describedBy | inputs | Identity, accessible label and application validation. |

### Example

```ts
// Imports: ReactiveFormsModule, AtlasSelect.
department = new FormControl<string | null>(null);
options = [{ label: 'Finance', value: 'finance' }];

<atlas-select controlId="department" ariaLabel="Department" [options]="options" [formControl]="department" />
```

### Current limits

- Single selection only; multi-select and autocomplete are available in Selection & entry; remote search is planned.
- Object option values are compared by identity; stable primitive keys are preferred.

## List / grid view

Browse a small collection as rows or cards, select a record, and activate it separately.

### Using the control

1. Switch between List and Grid layout. Search by record text.
2. Click a product to select it; double-click or Enter activates it.
3. Use pagination to move through the collection. Archived items remain unselectable.

### Keyboard

- Arrow keys, Home and End move focus among enabled items on the current page.
- Enter activates the current item; Tab enters or leaves the collection.

### API

| Property | Type | Description |
| --- | --- | --- |
| items | AtlasListItem[] | id, title, optional description/meta/icon/badge/tone/disabled. |
| layout | list \| grid | Presentation without changing selected identity. |
| selectedId | model<string \| null> | Two-way selection key. |
| selectionChange / itemActivated | outputs | Selection and activation events. |
| label / pageSize / loading | inputs | Accessible name, local page size, and pending state. |
| atlasListTemplate | ng-template directive | Optional typed item presentation. Context: $implicit AtlasListItem, selected boolean. Import AtlasListTemplate; use non-interactive content inside the option button. |

### Example

```ts
// Import AtlasListView.
selected = signal<string | null>(null);
items = [{ id: 'desk', title: 'Studio desk' }];

<atlas-list-view label="Inventory" [items]="items" [(selectedId)]="selected" />
```

### Current limits

- Local list/grid only; no virtualization or remote paging.
- Item templates customize presentation, not selection behavior. Do not nest links, inputs, or buttons inside an option.

## Data table

Inspect business records with search, column filters, ordered sorting, stable-key selection, configurable columns, row details, and local or server paging.

### Using the control

1. Click Amount to sort numerically. Click again to reverse.
2. Search across columns to narrow the results.
3. Checkboxes select records; the header checkbox selects only the current page.
4. Open Columns to hide fields. At least one data column must remain visible.
5. Change Rows per page to inspect pagination.

### Keyboard

- Tab moves through sorting buttons, checkboxes, row actions and page controls.
- Enter activates a sort or row action; Space toggles checkboxes.

### API

| Property | Type | Description |
| --- | --- | --- |
| rows / columns / keyField | T[] / AtlasColumn<T>[] / key | Typed data, column descriptions and stable row identity. |
| filterable / selectable / columnToggle | boolean | Opt-in search, row selection and visibility chooser. |
| selectedKeys | model<string[]> | Selection persists across filtering/pages until the consumer clears it. |
| pageSize / loading | number / boolean | Local page size and loading state. |
| AtlasColumn | key, label, format, sortValue, align, sortable | Format display separately from sort values. |
| AtlasCell / atlasCellOf | template directive | Typed custom cell content; use with AtlasTable. |
| rowActivated | output<T> | Open-row action. |
| columnFilters / multiSort / columnManage | boolean inputs | Enable contains filters, sort priorities, and sizing/reorder/pin controls. Also enable columnToggle to show the column settings. |
| server / total / queryChange | boolean / number / output<AtlasTableQuery> | Server mode displays supplied page rows unchanged. The consumer supplies filtered total and handles initial/subsequent query requests. |
| atlasRowDetail / atlasRowDetailOf | ng-template / readonly T[] | Typed expandable detail template; let-row receives the record. |

### Example

```ts
// Imports: AtlasTable.
<atlas-table [rows]="orders" [columns]="columns" keyField="id"
  [filterable]="true" [selectable]="true" [columnToggle]="true"
  [(selectedKeys)]="selected" />
```

### Current limits

- No virtualization or editable cells yet.
- Wide tables scroll horizontally on phones. Column settings remain keyboard and touch usable. Advanced examples are in Collections.
- Selections and expansion use unique stringified keys. Consumers must reconcile keys when records are permanently removed.

## Multi-select

Choose multiple values while keeping selections visible as removable chips.

### Using the control

1. Open Approvers, then check up to two people. Unselected choices are disabled when the limit is reached.
2. Search filters the available choices without clearing existing selections.
3. Use a chip’s remove button, Clear, or Reset request to remove selections. Changes commit immediately; Escape closes without undoing them.

### Keyboard

- Enter or Space opens the chooser. Tab moves through search, enabled checkboxes, Clear, and Done. Space toggles a checkbox.
- Escape dismisses and returns focus. Tabbing beyond the popup exits it.

### API

| Property | Type | Description |
| --- | --- | --- |
| controlId / label | string inputs | Unique control ID and accessible label. |
| disabled / readonly | boolean inputs | Disabled prevents interaction; readonly preserves focus while preventing edits. |
| formField | Signal Forms directive | Import FormField and bind a signal field. Alternatively use the model directly, but not both bindings on one instance. |
| options | AtlasOption<string>[] | Stable primitive values, labels, descriptions and disabled choices. |
| value | model<string[]> | Selected keys. Order follows selection; values are unique. |
| limit | number, default 0 | Maximum selectable options; zero means unlimited. Lowering the limit does not discard existing values. |
| loading | boolean | Replaces results with loading feedback. |

### Example

```ts
// Import AtlasMultiSelect from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
<atlas-multi-select controlId="approvers" label="Approvers"
  [options]="people" [limit]="2" [formField]="fields.approvers" />
```

### Current limits

- Local data only; no remote search, virtualization or select-all action.
- Disabled choices cannot be added; existing values can be removed.
- Use a string-array signal field; CVA consumers keep their existing APIs and require an explicit adapter for this control.

## Autocomplete

Find one named record by typing, then commit its key from suggestions.

### Using the control

1. Type a name or description in Requester. Matching suggestions appear.
2. Choose an enabled result to store its ID. Unmatched text is never stored as a key.
3. Escape or leaving the popup preserves the previous selection. Clear removes it.

### Keyboard

- Arrow Down opens suggestions; Up/Down move through enabled options; Home/End jump to the first/last.
- Enter selects, Escape cancels and returns focus, Tab leaves.

### API

| Property | Type | Description |
| --- | --- | --- |
| controlId / label | string inputs | Unique control ID and accessible label. |
| disabled / readonly | boolean inputs | Disabled prevents interaction; readonly preserves focus while preventing edits. |
| formField | Signal Forms directive | Import FormField and bind a signal field. Alternatively use the model directly, but not both bindings on one instance. |
| options | AtlasOption<string>[] | Labels and descriptions are searchable; values identify selected records. |
| value | model<string \| null> | Selected key or null; query text is separate. |
| loading | boolean | Pending suggestions cannot be committed. |

### Example

```ts
// Import AtlasAutocomplete from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
<atlas-autocomplete controlId="requester" label="Requester"
  [options]="people" [formField]="fields.requester" />
```

### Current limits

- Selection-only autocomplete: no arbitrary free-text values, async provider or debounce adapter yet.
- Suggestions use a local filtered list. Multi-column record selection remains AtlasLookup.

## Checkbox and radio groups

Present a short set of choices directly on a form without a dropdown.

### Using the control

1. Checkboxes permit several services; radio buttons choose one priority.
2. Disabled choices stay visible. Read-only blocks changes while keeping controls available for focus.

### Keyboard

- Checkboxes use Tab and Space.
- Radio buttons use native browser arrow-key navigation within the group.

### API

| Property | Type | Description |
| --- | --- | --- |
| controlId / label | string inputs | Unique control ID and accessible label. |
| disabled / readonly | boolean inputs | Disabled prevents interaction; readonly preserves focus while preventing edits. |
| formField | Signal Forms directive | Import FormField and bind a signal field. Alternatively use the model directly, but not both bindings on one instance. |
| AtlasCheckboxGroup.value | model<string[]> | Selected keys; optional limit enforces a maximum. |
| AtlasRadioGroup.value | model<string \| null> | One selected key. |
| options | AtlasOption<string>[] | Labels, descriptions and disabled choices. |

### Example

```ts
// Import AtlasCheckboxGroup, AtlasRadioGroup from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
<atlas-checkbox-group controlId="services" label="Services"
  [options]="services" [formField]="fields.services" />
<atlas-radio-group controlId="priority" label="Priority"
  [options]="priorities" [formField]="fields.priority" />
```

### Current limits

- No indeterminate checkbox or hierarchical selection.
- Provide a unique controlId for each radio group so unrelated groups do not share a browser radio name.

## Date and date range

Enter business calendar dates without converting them through a timezone.

### Using the control

1. Use Required by for a single calendar date. Use From/To for a delivery window.
2. A partially completed range is invalid. End must be on or after start.
3. Reset clears the sample dates. Your operating system supplies the calendar picker and local date presentation.

### Keyboard

- Native date-field keyboard behavior depends on browser and operating system. Tab navigates date segments and controls.

### API

| Property | Type | Description |
| --- | --- | --- |
| controlId / label | string inputs | Unique control ID and accessible label. |
| disabled / readonly | boolean inputs | Disabled prevents interaction; readonly preserves focus while preventing edits. |
| formField | Signal Forms directive | Import FormField and bind a signal field. Alternatively use the model directly, but not both bindings on one instance. |
| AtlasDateInput.value | model<string> | YYYY-MM-DD or empty string. No Date object or UTC conversion. |
| AtlasDateRangeInput.value | model<AtlasDateRange> | Object with start and end date-only strings. |
| minDate / maxDate | YYYY-MM-DD strings | Native picker bounds. Apply matching schema rules for form validity. |
| dateRangeError | pure function | Validates completeness, calendar validity, ordering and optional bounds. |

### Example

```ts
// Import AtlasDateInput, AtlasDateRangeInput, dateRangeError from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
// Signal Forms schema: validate(s.period, ctx => {
//   const message = dateRangeError(ctx.value());
//   return message ? { kind: 'range', message } : null;
// });
<atlas-date-input controlId="required" label="Required by" [formField]="fields.requiredBy" />
<atlas-date-range controlId="period" label="Delivery window" [formField]="fields.period" />
```

### Current limits

- Native date UI, not a custom calendar. Time, timezone/instant fields, week numbers, business-day rules and presets are later work.
- An entirely empty range is optional by default. Add a required-range schema rule if your workflow needs both dates.

## Decimal and currency entry

Display numbers in a chosen locale while retaining numeric values in the signal model.

### Using the control

1. Enter a budget or weight. Switch between en-US and de-DE to inspect separators.
2. The currency label is display-only; it does not change the numeric model.
3. Invalid text stays visible for correction and does not overwrite the last valid numeric value. The form must treat parse errors as blocking errors.

### Keyboard

- Use normal text editing. Focus removes grouping for editing; blur restores locale grouping.

### API

| Property | Type | Description |
| --- | --- | --- |
| controlId / label | string inputs | Unique control ID and accessible label. |
| disabled / readonly | boolean inputs | Disabled prevents interaction; readonly preserves focus while preventing edits. |
| formField | Signal Forms directive | Import FormField and bind a signal field. Alternatively use the model directly, but not both bindings on one instance. |
| value | model<number \| null> | Numeric value; empty input produces null. |
| locale | string, default en-US | Intl locale controlling decimal/group separators. |
| currency | string, default empty | Visible currency code, e.g. EUR; no conversion is performed. |
| fractionDigits | number, default 2 | Minimum displayed fraction digits; up to 10 digits retained for display. |
| parseErrorChange | output<boolean> | Connect to application validation; parsing errors must block saving. |
| parseLocaleNumber | function | Returns number, null for empty, undefined for invalid text. |

### Example

```ts
// Import AtlasDecimalInput from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
<atlas-decimal-input controlId="budget" label="Budget" currency="EUR"
  locale="de-DE" [formField]="fields.budget"
  (parseErrorChange)="badBudget.set($event)" />
```

### Current limits

- Initial parser supports ASCII digits and Western groups of three, verified for en-US/de-DE. Indian grouping, non-Latin numerals and accounting parentheses are unsupported.
- JavaScript numbers are not a financial decimal-arithmetic engine. Precision/rounding policy belongs to the application.
- Switching locale or resetting discards invalid draft text and formats the last committed numeric value.
- Currency codes are not parsed inside the text field.

## Validation summary

Collect errors into actionable links that take the user to the field needing attention.

### Using the control

1. Click Validate request to mark fields touched and show the summary.
2. Click an error to focus its field; correct it and the summary updates.
3. Disabled/read-only requests are not submitted or validated as editable requests.

### Keyboard

- Tab moves through error links; Enter focuses the associated field.

### API

| Property | Type | Description |
| --- | --- | --- |
| issues | AtlasValidationIssue[] | Unique field IDs and readable messages. |
| fieldRequested | output<string> | Consumer focuses the corresponding control in its own scope. |

### Example

```ts
// Import AtlasValidationSummary from @bqatlas/ui.
// For [formField], import FormField from @angular/forms/signals.
<atlas-validation-summary [issues]="issues()"
  (fieldRequested)="focusField($event)" />
```

### Current limits

- Application supplies errors; the component does not inspect forms or query the document.
- Include both form schema errors and control parsing errors before saving.

## Advanced table and server paging

An inventory table with independent column filters, sort priorities, column configuration, details, and a replaceable data provider.

### Using the control

1. Type in a column filter to match displayed text. Global search matches every word across columns. Both filters combine with AND; filtering resets to the first page.
2. Click a heading to sort ascending, then descending. Enable Add sort levels or Shift-click to append another priority. Clear sort restores source ordering.
3. Open Columns to show/hide, move left/right, pin to the left, or enter a width from 100–600 px. Drag the header edge to resize. At least one column stays visible. Pinned columns appear first, in their configured order.
4. Use + to expand row details. Selecting checkboxes stores IDs independently of the current page. Select all affects only the current page.
5. Switch to server paging to test delayed results. Simulate request failure, then Retry. Searching again cancels the previous request.
6. On narrow windows, scroll the table horizontally. Use the same settings and filters; row details wrap.

### Keyboard

- Tab reaches search, sort mode, column settings, headers, filters, row actions, and paging.
- Enter/Space activates sort and detail buttons. Shift-click adds sort priorities; the Add sort levels checkbox provides a touch/keyboard alternative.
- Column widths can be edited with the number field and arrow keys; move and pin actions use ordinary buttons.

### API

| Property | Type | Description |
| --- | --- | --- |
| columns | AtlasColumn<T>[] | Adds width (px) and filterable flags to existing columns. format controls filter text; sortValue controls local sorting. |
| columnFilters / multiSort / columnManage / columnToggle | boolean | Opt-in features. columnManage exposes sizing, pinning and ordering inside the columnToggle menu. |
| selectedKeys | model<string[]> | Stable stringified keys across filters/pages. Must be globally unique; selection does not mean editing. |
| atlasRowDetailOf | readonly T[] | Type inference for the atlasRowDetail template context, $implicit: T. |
| server / total / loading / error / retry | inputs and output<void> | Supply one page, filtered count, pending state and error. Retry emits to the consumer; server mode does not re-filter, re-sort or slice rows. |
| queryChange | output<AtlasTableQuery> | Emits initially and on page, pageSize, search, filters or sort changes. page is zero based; filters are case-insensitive contains text; sort is an ordered array of key/direction. |
| AtlasLatestRequest.run / cancel | adapter helper | run(request, accept, reject) aborts previous work and ignores stale completion/error even if the provider ignores abort. cancel on consumer destruction. |

### Example

```ts
// Imports: AtlasTable, AtlasRowDetail; type AtlasTableQuery.
<atlas-table [rows]="records" [columns]="columns" keyField="id"
  [filterable]="true" [columnFilters]="true" [multiSort]="true"
  [columnToggle]="true" [columnManage]="true"
  [server]="true" [total]="total" [loading]="loading" [error]="error"
  (queryChange)="load($event)" (retry)="retry()">
  <ng-template atlasRowDetail [atlasRowDetailOf]="records" let-row>{{row.id}}</ng-template>
</atlas-table>
```

### Current limits

- Filters are contains-text only; numeric ranges and operator menus are deferred.
- Column settings are per mounted component, not persisted layouts. Pinning is left-only; reorder uses buttons, not drag-and-drop.
- No virtualization, editing, grouping, or aggregate footer yet. Mobile presentation is horizontal scrolling.
- The provider must apply matching search/filter/sort semantics before paging and return the filtered total. The sample is a delayed in-memory adapter, not HTTP.
- Server collation, authorization, validation and query allowlists are the backend responsibility. Do not bind raw arbitrary field names into database queries.

## Tree navigation

Browse a hierarchy while keeping expansion, keyboard focus, and selected node ID separate.

### Using the control

1. Expand a branch with its disclosure or Right arrow. Select an enabled node with Enter or a row click.
2. Search labels/descriptions to reveal matching nodes and their ancestors. Clearing search restores saved expansion.
3. Disabled nodes remain navigable so their children can be inspected; they cannot be selected. leafOnly can restrict selection to leaves.
4. Compact desktop rows are approximately 24 px tall with 14 px indentation per level. Descriptions sit beside labels and wrap when needed. Comfortable/mobile rows retain 42 px minimum targets.

### Keyboard

- Up/Down, Home/End move focus without selecting.
- Right expands or enters a branch. Left collapses or moves to its parent. Enter/Space selects.
- Search temporarily expands matches. During search Left moves to the parent; collapsing search results is disabled.

### API

| Property | Type | Description |
| --- | --- | --- |
| nodes | readonly AtlasTreeNode[] | Unique string id, label, optional description, disabled, children. IDs must be globally unique; provide an acyclic tree. |
| selectedId / expandedIds | model<string\|null> / model<string[]> | Consumer-controlled committed selection and expanded branches. |
| nodeSelected | output<AtlasTreeNode> | Emits only an enabled committed node; focus movement does not commit. |
| label / filterable / leafOnly | string / boolean / boolean | Accessible tree label, local search, and optional leaf selection restriction. |
| disabled / readonly | boolean | Disabled blocks selection/expansion. Readonly allows browsing but blocks selection. |
| loading / error / retry | boolean / string / output<void> | Consumer-owned loading and error presentation with retry. |
| --atlas-tree-row-height / --atlas-tree-indent | CSS custom properties | Density-aware minimum row height and indentation. Compact defaults: 24 px / 14 px; comfortable: 42 px / 20 px. |

### Example

```ts
// Import AtlasTree; type AtlasTreeNode.
nodes: AtlasTreeNode[] = [{id: "region", label: "Region", children: [{id: "bay", label: "Receiving bay"}]}];
selected = signal<string | null>(null);
<atlas-tree [nodes]="nodes" label="Locations" [(selectedId)]="selected" />
```

### Current limits

- Local, single-selection tree only. No lazy loading of individual branches, drag-and-drop, check propagation, or virtualization.
- Disabled nodes are focusable for structural navigation. Broad screen-reader and device qualification is still pending.

## Tree select with Signal Forms

Choose a leaf from a hierarchy while storing its ID in a form. The expandable inline panel fits within application windows.

### Using the control

1. Open the field, search or expand branches, then select an enabled leaf. The field displays the label while its value stores the ID.
2. Clear selection sets null. Done or Escape closes without changing the value and restores trigger focus.
3. Bind with native Signal Forms or a direct value model. Keep the selected record available in nodes so its label can be resolved.

### Keyboard

- Tab focuses the trigger; Enter/Space opens the inline panel. Tab moves into search and then the tree.
- Use the tree arrow keys to navigate, Enter/Space to commit. Escape inside the panel closes it.

### API

| Property | Type | Description |
| --- | --- | --- |
| nodes / leafOnly | AtlasTreeNode[] / boolean | Tree source and selection policy; leafOnly defaults true. |
| value | model<string\|null> | Committed ID; null means no selection. Use [(value)] or [formField], not both. |
| label / controlId / describedBy | string inputs | Accessible trigger name, external label ID and help/error association. |
| disabled / readonly / invalid / touched | Signal Forms state inputs | Disabled blocks trigger focus; readonly permits browsing but prevents edits. touchedChange reports interaction. |
| loading / error / retry | boolean / string / output<void> | Passed to the tree panel. |
| focus() | method | Focuses the trigger. |

### Example

```ts
// Imports: AtlasTreeSelect, FormField; form/required from @angular/forms/signals.
draft = signal<{location: string | null}>({location: null});
fields = form(this.draft, schema => required(schema.location));
<atlas-tree-select [nodes]="locations" label="Receiving location" [formField]="fields.location" />
```

### Current limits

- Inline disclosure panel, not a floating combobox popup. Opening it moves content below; this is intentional for constrained ERP windows.
- No CVA adapter, multiple selection, cascading checkbox behavior, or remote label resolution yet.

## Compact and comfortable density

Compact desktop spacing puts more ERP records and fields in view. Comfortable spacing provides larger targets; mobile workspaces use it automatically.

### Using the control

1. Desktop controls default to compact: 28 px inputs/buttons, reduced panel padding and table cell spacing, and a 32 px window title bar. Text remains readable at its existing size.
2. Use the Compact / Comfortable toggle in the showcase to switch density. This affects panels, forms, lists and tables, not only input heights.
3. For a consumer, set data-density="comfortable" on a containing element to opt into larger controls. Mobile workspace presentation applies comfortable tokens locally.

### Keyboard

- The density toggle is an ordinary button: Tab to focus, Enter or Space to switch.
- Density changes do not alter keyboard navigation or selection state.

### API

| Property | Type | Description |
| --- | --- | --- |
| data-density="comfortable" | ancestor HTML attribute | Overrides inherited density tokens with 42 px controls and more generous spacing. |
| --atlas-control-height / --atlas-space | CSS custom properties | Control height and general layout spacing. Default 28 px / 8 px; comfortable 42 px / 16 px. |
| --atlas-panel-padding / --atlas-cell-padding / --atlas-toolbar-padding | CSS custom properties | Panel content, table cells and collection toolbar spacing. |

### Example

```ts
<!-- Compact is the default. Import @bqatlas/ui/theme.css once. -->
<section data-density="comfortable">
  <atlas-table [rows]="orders" [columns]="columns" keyField="id" />
</section>
```

### Current limits

- Density is inherited presentation state, not a per-control input. Custom cell/item content may require its own responsive styling.
- Mobile workspace spacing is automatic; standalone applications choose a density appropriate to their input devices.

## Editable grid

Edit one record at a time with a separate row draft. Applying a row changes the order draft; saving the order remains the application’s responsibility.

### Using the control

1. Choose Edit to copy a row into the editor. The first editable field receives focus. Other rows remain protected until Apply or Cancel.
2. Required values, finite numbers, bounds and numeric step rules are checked before applying. Correct the field errors and retry.
3. Apply row updates rows by stable key. Cancel row discards the temporary edit. Both return focus to the row action.
4. In the purchase-order example, Save order also validates/applies a pending row before saving. A failed save leaves the order draft available for retry.
5. Remove emits a request. The example confirms before removing a line. On mobile workspaces lines become labelled cards.

### Keyboard

- Tab/Shift+Tab move between native fields and row actions.
- Ctrl/Cmd+Enter applies the row. Escape cancels the row without closing its workspace window.
- Use normal keyboard interaction for number and select fields.

### API

| Property | Type | Description |
| --- | --- | --- |
| rows | model<T[]> | Order-draft rows. Apply replaces the matching row immutably; it does not call an API. |
| draft | model<T\|null> | Temporary row edit. Bind to parent-owned signal state to preserve edits when views unmount. |
| columns | AtlasEditColumn<T>[] | key, label, text/number/select type, readonly, required, min/max/step, options and format. |
| keyField | keyof T & string | Unique stable identity. Treat the key column as readonly. Source records must be structured-cloneable. |
| disabled / removable | boolean | Locks mutations, or enables Remove actions. |
| rowApplied / removeRequested | output<T> | Reports applied rows and requested removals. |
| validateEditRow / replaceEditedRow | pure helpers | Validate draft values and safely replace an existing record without mutating original data. |

### Example

```ts
// Imports: AtlasEditableGrid; type AtlasEditColumn.
lines = signal([{id: "L-1", quantity: 1}]);
rowDraft = signal<{id: string; quantity: number} | null>(null);
columns: AtlasEditColumn<{id: string; quantity: number}>[] = [{key: "quantity", label: "Quantity", type: "number", required: true, min: 1, step: 1}];
<atlas-editable-grid [columns]="columns" keyField="id" [(rows)]="lines" [(draft)]="rowDraft" />
```

### Current limits

- One row editor at a time with native text, number and select fields. This is not a spreadsheet: range selection, paste, cell-arrow navigation, custom editor templates and virtualization remain future work.
- Validation is synchronous. Server validation, authorization and concurrency/version checks belong to the persistence adapter.
- Native number inputs and JavaScript numbers are used; this is not an exact monetary arithmetic engine.
- Consumer-owned row keys must remain unique and immutable. Keep pending draft rows in the source until Apply or Cancel.

## Master/detail layout

Keep a record list and editor together on desktop; switch between preserved regions when the component becomes narrow.

### Using the control

1. Project the record list with atlasMaster and the editor with atlasDetail.
2. Set detailOpen true after choosing a record. Below the component breakpoint, the list gives way to the editor.
3. Use Back to return to the list. Both regions remain mounted, so local form state survives presentation changes.
4. The purchase-order example asks before discarding unsaved changes when another record is chosen. Its state is owned by the gallery, so category changes retain drafts.

### Keyboard

- Record buttons use Tab and Enter.
- Back restores focus to the originating record when available.

### API

| Property | Type | Description |
| --- | --- | --- |
| detailOpen | model<boolean> | Which region is visible in narrow mode. Desktop shows both. |
| masterLabel / detailLabel | string | Accessible names and Back label. |
| breakpoint | number | Component width breakpoint in CSS pixels, default 680. ResizeObserver watches the host. |
| atlasMaster / atlasDetail | projection attributes | Content slots; regions stay mounted while hidden. |

### Example

```ts
// Import AtlasMasterDetail.
<atlas-master-detail [(detailOpen)]="opened" masterLabel="Orders">
  <div atlasMaster><!-- Record selection --></div>
  <div atlasDetail><!-- Editor --></div>
</atlas-master-detail>
```

### Current limits

- Layout only: record loading, dirty guards and routing are owned by the consumer.
- No draggable divider or persisted pane sizing yet. Narrow mode follows component width, not only browser width.

## Command toolbar

Compact grouped actions with explicit disabled state and keyboard navigation.

### Using the control

1. Supply action IDs, labels, optional icons, primary styling and group names.
2. Handle command IDs in the consumer. The purchase-order example provides Save, Discard and Add line.
3. Actions wrap on narrow screens. Project a short status message for saved, dirty or saving state.

### Keyboard

- Tab enters at the current enabled command. Left/Right wrap through enabled commands; Home/End jump to the first/last.
- Enter or Space executes the focused action. Disabled actions are skipped.

### API

| Property | Type | Description |
| --- | --- | --- |
| commands | AtlasCommand[] | Unique id, label, optional icon, primary, disabled and group. |
| command | output<string> | ID of the activated enabled action. |
| label / disabled | string / boolean | Accessible toolbar name and global action lock. |

### Example

```ts
// Import AtlasCommandToolbar.
<atlas-command-toolbar [commands]="actions" (command)="run($event)" [disabled]="saving()">{{status()}}</atlas-command-toolbar>
```

### Current limits

- Uses wrapped visible actions. Overflow menus, split buttons and configurable shortcut registration are not included yet.
- Consumers enforce permissions and action semantics; hiding or disabling an action is not backend authorization.

## Dialogs and confirmation

Native modal dialogs for adding lines and confirming discard/removal, with browser focus containment.

### Using the control

1. Bind open and supply a title. Project body content and an atlasDialogActions footer.
2. Validate before closing. The purchase-order Add line dialog stays open when values are invalid.
3. Cancel, Close or Escape dismisses. Set busy to prevent user dismissal during a pending operation.
4. Inside the playground, the dialog is sized to its owning window. The browser modal backdrop blocks the rest of the page while it is open.

### Keyboard

- Tab and Shift+Tab remain within the native modal dialog.
- Escape dismisses unless busy. Native dialog closure restores focus to the opener when it remains available.

### API

| Property | Type | Description |
| --- | --- | --- |
| open | model<boolean> | Show/close the native modal dialog. |
| title / busy | string / boolean | Required accessible title; busy prevents Close and Escape dismissal. |
| dismissed | output<void> | User dismiss action. Programmatically setting open false does not emit it. |
| atlasDialogActions | projection attribute | Footer controls supplied by the consumer. |

### Example

```ts
// Import AtlasDialog, AtlasButton.
<atlas-dialog title="Discard changes?" [(open)]="confirmOpen">
  <p>Your unsaved edits will be lost.</p>
  <div atlasDialogActions><button atlasButton (click)="confirmOpen.set(false)">Keep editing</button></div>
</atlas-dialog>
```

### Current limits

- Native page-modal behavior: this is not an independent modal stack for every desktop window. Do not open multiple application dialogs at once.
- Drawer presentation and asynchronous dialog services are deferred.

## Record navigator

Move between quotes with first/previous/next/last, an ID selector, and New record. Dirty drafts offer Keep editing, Discard and continue, or Save and continue.

### Using the control

1. Move between quotes with first/previous/next/last, an ID selector, and New record. Dirty drafts offer Keep editing, Discard and continue, or Save and continue.
2. See projects/playground/src/app/quote-examples.ts and quote-demo.ts for the complete signal-backed integration.

### Keyboard

- Use Tab to reach each action and Enter or Space to activate it. Native select navigation applies to the record selector.

### API

| Property | Type | Description |
| --- | --- | --- |
| records / currentId / disabled | AtlasRecordOption[] / string / boolean | Controlled record list with stable id and label. Disable while saving. |
| navigate / create | output<string> / output<void> | Requests only. The owner guards unsaved state, saves or discards, then updates currentId. The navigator never changes domain data. |

### Example

```ts
<atlas-record-navigator [records]="options()" [currentId]="draft().id" [disabled]="saving()" (navigate)="requestRecord($event)" (create)="requestRecord('new')" />
```

### Current limits

- Local record list; Find record is a native ID selector with browser type-ahead, not remote search.
- The consumer owns dirty prompts, record creation, persistence, and focus after navigation. New quote cancellation returns to the first saved record.

## Dependent lookups

Customer and delivery address demonstrate a dependent selection. Changing customer clears the address and limits its choices to that customer.

### Using the control

1. Customer and delivery address demonstrate a dependent selection. Changing customer clears the address and limits its choices to that customer.
2. See projects/playground/src/app/quote-examples.ts and quote-demo.ts for the complete signal-backed integration.

### Keyboard

- Use Tab to reach each action and Enter or Space to activate it. Native select navigation applies to the record selector.

### API

| Property | Type | Description |
| --- | --- | --- |
| dependentRecords | (rows, parent, parentKey) => T[] | Pure local filtering helper exported from @bqatlas/ui. Null parent yields no records; it never clears a model automatically. |

### Example

```ts
readonly addresses = computed(() => dependentRecords(allAddresses, customerId(), row => row.customerId));
// In your customer change handler, clear addressId when the parent changes.
// Bind addresses() to AtlasLookup.rows; validate the saved address belongs to the selected customer.
```

### Current limits

- Local data only; remote loading, cancellation and backend constraints remain consumer responsibilities.

## Validation navigator

After an invalid save, activate an error to focus its header field or the exact datasheet cell. Resolved errors disappear as the draft changes.

### Using the control

1. After an invalid save, activate an error to focus its header field or the exact datasheet cell. Resolved errors disappear as the draft changes.
2. See projects/playground/src/app/quote-examples.ts and quote-demo.ts for the complete signal-backed integration.

### Keyboard

- Use Tab to reach each action and Enter or Space to activate it. Native select navigation applies to the record selector.

### API

| Property | Type | Description |
| --- | --- | --- |
| errors | AtlasValidationTarget[] | Unique stable target IDs and human-readable messages supplied by the consumer. |
| activate | output<AtlasValidationTarget> | Consumer reveals a hidden tab if necessary, waits for rendering, then focuses and scrolls the target. No global DOM lookup is performed by this control. |

### Example

```ts
<atlas-validation-navigator [errors]="errors()" (activate)="focusError($event)" />
```

### Current limits

- Validation rules and target resolution belong to the feature. The Quotes demo has one visible form; hidden-tab activation is a consumer integration hook, not automatically implemented.

## Property sheet

Compact grouped label/value editing for record properties. The demo includes text, numbers, a choice field, checkbox and a read-only code.

### Using the control

1. Edit account properties directly. Adjust Discount, Tax and Shipping to update the totals panel.
2. Reset properties restores the sample values. Numeric range errors in the demo suppress the totals until corrected.

### Keyboard

- Tab follows the native control order. Enter/Space activates buttons and checkboxes; native select and text-editing keys apply.

### API

| Property | Type | Description |
| --- | --- | --- |
| fields | AtlasProperty[] | Unique key, label, group, type, optional readonly, min/max/step, options and hint. |
| value / valueChange | Record<string, AtlasPropertyValue> | Immutable two-way model; blank numeric input produces null. Consumer validates and persists. |
| disabled | boolean | Disables editors; read-only values remain displayed. |

### Example

```ts
<atlas-property-sheet [fields]="fields" [(value)]="draft" />
```

### Current limits

- Native input constraints do not replace consumer validation. No Signal Forms/CVA adapter or custom editor projection in this first version.

## Totals and adjustments

Display labeled currency amounts with an emphasized total. The application computes discount, tax, shipping and rounding.

### Using the control

1. Change the property-sheet adjustments to see recalculated amounts.
2. Demo calculation: discount first, tax on discounted subtotal, then shipping.

### Keyboard

- Tab follows the native control order. Enter/Space activates buttons and checkboxes; native select and text-editing keys apply.

### API

| Property | Type | Description |
| --- | --- | --- |
| lines | AtlasTotalLine[] | Stable id, label, numeric value, optional emphasis. |
| currency / locale | string | Intl.NumberFormat configuration; defaults USD and en-US. |

### Example

```ts
<atlas-totals-panel [lines]="totals()" currency="USD" />
```

### Current limits

- Display-only; tax rules, currency conversion and financial decimal arithmetic are not implemented by the component.

## Activity timeline

A compact chronological list of notes, calls and status events.

### Using the control

1. Add an internal note to prepend it to the local timeline.
2. Events retain their supplied order and render actor, kind and timestamp.

### Keyboard

- Tab follows the native control order. Enter/Space activates buttons and checkboxes; native select and text-editing keys apply.

### API

| Property | Type | Description |
| --- | --- | --- |
| events | AtlasActivity[] | Stable id, title, detail, actor, ISO timestamp and kind. |
| label | string | Accessible list label. |

### Example

```ts
<atlas-activity-timeline [events]="activity()" />
```

### Current limits

- Consumers own ordering, paging and persistence. Timestamps use the viewer locale; no audit guarantees or rich-text rendering.

## Document attachments

Choose files, show upload progress, retry failed uploads, preview ready files and remove or cancel items.

### Using the control

1. Add a sample or choose local files up to 2 MB. No data is sent to a server.
2. Enable Fail next upload to inspect the error and Retry action. Remove during upload cancels its simulated timer.
3. Preview text as plain text (first 20,000 characters); other formats show metadata.

### Keyboard

- Tab follows the native control order. Enter/Space activates buttons and checkboxes; native select and text-editing keys apply.

### API

| Property | Type | Description |
| --- | --- | --- |
| files | AtlasAttachment[] | Controlled id/name/size/status/progress/error metadata. Status is uploading, ready or error. |
| add / preview / retry / remove | outputs | add emits File[]; other outputs emit the stable attachment id. Your adapter owns IO, cancellation, validation and deletion. |
| disabled / accept | boolean / string | Disable actions or configure the native file picker. accept is a picker hint, not validation. |

### Example

```ts
<atlas-attachment-list [files]="files()" (add)="upload($event)" (preview)="preview($event)" (retry)="retry($event)" (remove)="remove($event)" />
```

### Current limits

- No network uploader or PDF/image viewer is bundled. The demo keeps File objects in memory, clears timers on disposal, and escapes preview text. Production adapters must handle cancellation, size/type validation and server errors.

## Saved views and filter builder

Compose AND conditions against an account list and save named filter snapshots for reuse.

### Using the control

1. Add a condition; choose a field, operator and value. The local result list updates immediately.
2. Load Active accounts or High balance, or save the current filters under a unique name.
3. Editing loaded conditions leaves the saved snapshot intact. Delete removes a saved view, not matching records.

### Keyboard

- Tab follows the native control order. Enter/Space activates buttons and checkboxes; native select and text-editing keys apply.

### API

| Property | Type | Description |
| --- | --- | --- |
| fields / rules | AtlasFilterField[] / model<AtlasFilterRule[]> | Text fields support contains/equals; numeric fields support equals/gte/lte. Stable rule IDs are required. |
| views / saveRequested / deleteRequested | AtlasSavedView[] / outputs | Consumer stores snapshots. Save emits a name; delete emits the view ID. |
| matchesFilterRules | (row, rules) => boolean | Pure AND matcher. Text matching ignores case, numeric comparisons reject empty/nonfinite operands. Missing fields do not match. |

### Example

```ts
<atlas-filter-builder [fields]="fields" [(rules)]="rules" [views]="views()" (saveRequested)="saveView($event)" (deleteRequested)="deleteView($event)" />
```

### Current limits

- Flat AND only: no nested OR, dates, column layouts, sorting or remote-query adapter. A saved view currently stores filters only. Saved views and all demo edits reset when the gallery is disposed or reloaded.

## Document viewer and upload queue

Preview local images, PDF files and plain text, with a cancellable upload queue and retry.

### Using the control

1. Add a sample image, PDF or text file, or choose your own files up to 10 MB. Upload progress is simulated; no network request is made.
2. Preview a ready file. Images support zoom, rotation and reset. PDFs render locally with PDF.js, previous/next page, zoom and extracted page text. Download original is always available.
3. Enable Fail next upload to test retry. Remove cancels an active upload and clears its preview.
4. File previews and queue entries survive category switches and are released on gallery disposal.

### Keyboard

- Tab navigates controls; Enter/Space activates buttons. Open Page text for the extracted text of the rendered PDF page.

### API

| Property | Type | Description |
| --- | --- | --- |
| AtlasDocumentViewer.file | File \| null | Local File input. Owns and revokes its generated object URL on replacement/disposal. No arbitrary URL input. |
| AtlasUploadQueue | new(adapter, maxBytes?) | Adapter receives File plus AbortSignal and progress callback. Default limit 10 MB. Call add, upload(id) for retry, remove(id) to abort/remove, and destroy on disposal. |
| AtlasUploadAdapter | (file, {signal, progress}) => Promise<void> | Consumer owns HTTP, remote IDs and server validation; resolve only when upload succeeds. Queue ignores stale progress/completions after cancellation. |
| AtlasDocumentViewer.pdfWorkerSrc / AtlasPdfViewer.workerSrc | string | Default assets/pdfjs/pdf.worker.min.mjs. Copy the matching pdfjs-dist build worker and standard_fonts directory to this asset folder; PDF.js is a peer dependency and is loaded lazily. |

### Example

```ts
// Import AtlasDocumentViewer from @bqatlas/ui/documents; AtlasAttachmentList and AtlasUploadQueue from @bqatlas/ui.
readonly queue = new AtlasUploadQueue(yourUploadAdapter);
// Register queue.destroy() with DestroyRef.onDestroy.
<atlas-document-viewer [file]="selectedFile()" />
```

### Current limits

- PDF.js canvas rendering with extracted text, not a full PDF editor: no annotations, forms, OCR or password-entry flow. Corrupt/protected files show an error. Rendered page dimensions are capped at 4096 pixels.
- Image preview supports PNG, JPEG, WebP, GIF and AVIF MIME types; SVG and other formats use download fallback. Images are not edited or re-encoded by zoom/rotation.
- Plain-text preview is limited to the first 100 KB and rendered as escaped text. Unsupported formats show a download fallback.
- Demo uploads are simulated. Production adapters must validate file content and size on the server and persist returned document identifiers.
