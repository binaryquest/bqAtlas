# Reusing the editable datasheet

This is the implementation guide for developers and AI coding agents adding invoice lines, inventory adjustments, CRM records, quote lines, or similar editable tables.

## What is reusable today

Import `AtlasDatasheet` and `AtlasLookup` from `@bqatlas/ui`. `AtlasDatasheet` is a standalone Angular directive applied to a native table, not a quote-specific component. It provides navigation and cell focus styling without owning your records. Keep the existing directive instead of copying keyboard handlers into a new screen.

| Layer | Responsibility | Reference |
| --- | --- | --- |
| Library | Keyboard navigation, focus and scroll handling | `frontend/projects/ui/src/lib/datasheet.ts` |
| Library | Searchable multi-column selection and popup keyboard behavior | `frontend/projects/ui/src/lib/lookup.ts` |
| Library | Shared density, cell and focus styling | `frontend/projects/ui/src/theme.css` |
| Feature | Columns, editors, labels, record IDs and responsive scroll wrapper | `projects/playground/src/app/quote-examples.ts` |
| Feature store | Saved snapshot, draft, dirty state, validation and save/cancel | `projects/playground/src/app/quote-demo.ts` |
| Gallery host | Draft lifetime and workspace unsaved-close integration | `projects/playground/src/app/component-lab.ts` |

Paths in this guide are relative to the repository root. The Quotes example is the full reference for asynchronous save failures, product-price filling and workspace integration. It is not part of the library's public API. `AtlasEditableGrid` is a different control with explicit per-row Edit/Apply/Cancel; use `AtlasDatasheet` for continuous, always-editable cells.

## Copyable standalone example

This complete component demonstrates a second domain: inventory count lines. It uses signals and OnPush and works in the zoneless playground. Import the library theme once at the application level, as the playground already does. The Save implementation below deliberately commits only to memory; replace it with your adapter for real persistence.

```ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AtlasButton, AtlasDatasheet } from '@bqatlas/ui';

interface CountLine {
  id: string;
  bin: string;
  quantity: number | null;
}

@Component({
  selector: 'app-inventory-count',
  imports: [AtlasButton, AtlasDatasheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <button atlasButton [disabled]="!dirty()" (click)="save()">Save count</button>
      <button atlasButton [disabled]="!dirty()" (click)="cancel()">Cancel changes</button>
    </div>
    <p id="count-help">Arrow keys move between cells. Tab wraps rows.</p>
    @if (error()) { <p role="alert">{{ error() }}</p> }
    <div class="sheet-scroll" tabindex="0" role="region" aria-label="Inventory count lines">
      <table atlasDatasheet aria-label="Inventory count" aria-describedby="count-help">
        <thead><tr><th scope="col">Bin</th><th scope="col">Counted quantity</th></tr></thead>
        <tbody>
          @for (line of draft(); track line.id; let i = $index) {
            <tr>
              <td><input data-sheet-editor [value]="line.bin"
                [attr.aria-label]="'Bin, line ' + (i + 1)"
                (input)="patch(line.id, { bin: $any($event.target).value })" /></td>
              <td><input data-sheet-editor type="number" min="0" step="1"
                [value]="line.quantity" [attr.aria-label]="'Count, line ' + (i + 1)"
                (input)="patch(line.id, { quantity: readNumber($event) })" /></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .sheet-scroll { overflow: auto; max-height: 420px; }
    table { min-width: 360px; }
  `,
})
export class InventoryCount {
  readonly saved = signal<CountLine[]>([
    { id: 'bin-a', bin: 'A-01', quantity: 12 },
    { id: 'bin-b', bin: 'B-02', quantity: 8 },
  ]);
  readonly draft = signal(structuredClone(this.saved()));
  // Suitable for these small plain records; use explicit change tracking at scale.
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  readonly error = signal('');

  patch(id: string, patch: Partial<CountLine>) {
    this.draft.update(lines => lines.map(line => line.id === id ? { ...line, ...patch } : line));
    this.error.set('');
  }
  readNumber(event: Event): number | null {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(value) ? value : null;
  }
  cancel() {
    this.draft.set(structuredClone(this.saved()));
    this.error.set('');
  }
  save() {
    if (this.draft().some(line => !line.bin.trim() || line.quantity === null ||
        !Number.isInteger(line.quantity) || line.quantity < 0)) {
      this.error.set('Each bin needs a name and a nonnegative whole count.');
      return;
    }
    this.saved.set(structuredClone(this.draft()));
    this.error.set('');
  }
}
```

## Adding a multi-column lookup cell

Add `AtlasLookup` to the component imports and `AtlasLookupColumn` to its TypeScript imports. Define stable lookup records and callbacks on the component, for example:

```ts
interface Product { id: string; name: string; stock: number }
readonly products: Product[] = [{ id: 'P-1', name: 'Desk', stock: 24 }];
readonly productColumns: AtlasLookupColumn<Product>[] = [
  { key: 'id', label: 'Code', width: 90 },
  { key: 'name', label: 'Product' },
  { key: 'stock', label: 'Stock', width: 70, align: 'right' },
];
readonly productKey = (product: Product) => product.id;
readonly productLabel = (product: Product) => product.name;
```

Extend your line model with `productId: string | null`, initialize it on each line, and add a matching column header and cell:

```html
<td>
  <atlas-lookup data-sheet-editor
    [controlId]="instanceId + '-product-' + line.id"
    [ariaLabel]="'Product, line ' + (i + 1)"
    [rows]="products" [columns]="productColumns"
    [recordKey]="productKey" [displayWith]="productLabel"
    [value]="line.productId"
    (valueChange)="patch(line.id, { productId: $event })"
    [clearable]="false" arrowNavigation="grid" />
</td>
```

Define a stable, page-unique `instanceId` for each mounted feature instance (a workspace task ID works). Do not reuse DOM IDs when two windows show the same record. Use `recordSelected` instead of `valueChange` when dependent fields must be filled from the selected record, as Quotes does for the price. Decide explicitly whether changing a product should overwrite a manually edited price.

`arrowNavigation="grid"` is required here: plain Up/Down must reach the table instead of opening the lookup. `clearable=false` keeps a single primary tab target per lookup cell. Alt+Down/F4, Enter or Space opens it. Popup events remain owned by the lookup.

## Structural and behavioral contract

- Use one native table with a `thead` and a single `tbody`. Keep the same column positions across body rows; no merged cells, nested tables, virtual rows, or extra detail rows in that body.
- The table's **immediate parent** must be its scroll container (`overflow: auto`). The directive scrolls that element to reveal the focused editor. Give the wrapper an accessible name and preserve horizontal scrolling at narrow widths.
- Mark exactly one primary focus target per editable `td` with `data-sheet-editor`: a native input/button, or an `AtlasLookup` host containing its combobox button. Row action buttons can also be marked.
- Read-only/derived cells should contain text and have **no marker**. A native `readonly` input is still focusable and is not automatically skipped. Disabled editors and editors under `[hidden]` are skipped; CSS-only hidden editors are not supported.
- Do not mark multiline textareas or native selects without adapting their keyboard behavior: vertical arrows are reserved for row navigation. Arbitrary custom controls are not automatically supported; the current adapter only resolves a marked host's `[role=combobox]` descendant.
- Label every editor with its field and row. Use native table headers, stable row keys with `@for (...; track line.id)`, and unique control IDs. Do not add `role="grid"` unless implementing its complete accessibility model.
- Left/Right move within the row; Up/Down retain the column. Disabled targets are skipped. Tab wraps to the next row and exits normally at the overall boundary. Enter in an input moves down; Shift+Enter moves up. Shift+Left/Right retains native selection. Ctrl/Cmd+Home/End jumps to the first/last marked target.
- The directive does not consume already-handled events, IME composition, Alt combinations or events originating inside a `[popover]`. Preserve this separation when extending it.

## Draft lifetime, persistence and errors

Keep saved records separate from draft records; never mutate a saved snapshot in place. Save the whole master record and its lines as one operation. Validate both header and lines before sending. Only replace the saved snapshot after success. Keep the draft and show a retryable error on failure. Cancel clones the last successful snapshot, restoring additions and removals too.

For asynchronous persistence, disable editors, add/remove, cancel and duplicate save while saving; retain a store-level guard as well. Capture the payload before awaiting the adapter. Reconcile the saved/draft snapshots with the server response if it assigns IDs or normalizes values. Financial rounding, authorization, concurrency conflicts and server validation belong to the application/backend contract, not the navigation directive.

If an `@switch` destroys the view, provide its draft store on the persistent parent, as `ComponentsScreen` does with `QuoteDemo`. In workspace features, bind dirty/saving state and `task.lifecycle.save` through optional `ATLAS_TASK`; reject on save failure so Save & close keeps the task open. Clean up the lifecycle hook when the owning view is destroyed. Standalone views must also work without `ATLAS_TASK`.

## Instructions for an AI implementing another view

1. Read this guide and the four library/feature reference files listed above. Check the installed Angular version and existing public exports; do not add another grid package just for editing.
2. Reuse `AtlasDatasheet`, `AtlasLookup` and shared theme styles. Create a domain-specific standalone OnPush component and signal-backed draft store. No Zone.js dependency or manual global key listener.
3. Define stable row IDs, editable columns, read-only totals, validation, save/cancel scope and product lookup side effects explicitly. Keep business logic out of the navigation directive.
4. Follow the wrapper/marker contract, add accessible row-aware names, and retain compact desktop density and touch sizing.
5. Add the view to the showcase with a documentation catalog entry. Run `npm run docs` after modifying `docs/atlas-controls/catalog.json`; do not edit generated `USER-GUIDE.md` directly.
6. Verify arrows, Tab/Shift+Tab boundaries, disabled cells, popup search/selection/Escape, invalid inputs, failed save/retry, cancel after add/remove, and draft survival after category/window changes. Test narrow layout without moving the workspace canvas. Run `npm run build` and relevant regression tests.

Current scope is a small, local, nonvirtualized datasheet. Bulk paste, range selection, undo history and a separate mobile line-card editor are not implemented. Extend those as explicit library features, with documentation and tests, rather than silently recreating the directive inside one feature.

## Related workflow controls

`AtlasRecordNavigator` takes `records` ({id,label}[]), `currentId`, and `disabled`, and emits `navigate(id)` or `create()`. The feature must guard dirty state before replacing the draft. See QuoteDemo.requestRecord, pending, saveAndNavigate and discardAndNavigate for the implementation.

For dependent lookup choices, `dependentRecords(rows, parentId, row => row.parentId)` is a pure local filter. Clear the dependent selection in the parent-change handler, then validate that the selected child belongs to the selected parent before saving. The helper never changes your model.

`AtlasValidationNavigator` takes `{id,message}[]` and emits `activate(error)`. Resolve targets within the owning component, reveal any hidden tab before focusing, and scroll only the relevant content containers. Quotes supplies a concrete focus handler for header lookup triggers and datasheet cells. The reusable component does not assume a DOM layout or perform global ID searches.
