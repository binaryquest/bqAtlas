import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { AtlasButton, AtlasInput } from "./primitives";
export type AtlasFilterOperator = "contains" | "equals" | "gte" | "lte";
export interface AtlasFilterField {
  key: string;
  label: string;
  type: "text" | "number";
}
export interface AtlasFilterRule {
  id: string;
  field: string;
  operator: AtlasFilterOperator;
  value: string;
}
export interface AtlasSavedView {
  id: string;
  name: string;
  rules: AtlasFilterRule[];
}
export function matchesFilterRules(
  row: Record<string, unknown>,
  rules: readonly AtlasFilterRule[],
): boolean {
  return rules.every((rule) => {
    const value = row[rule.field];
    if (value === null || value === undefined) return false;
    if (rule.operator === "gte" || rule.operator === "lte") {
      if (!rule.value.trim() || !String(value).trim()) return false;
      const n = Number(value),
        limit = Number(rule.value);
      return (
        Number.isFinite(n) &&
        Number.isFinite(limit) &&
        (rule.operator === "gte" ? n >= limit : n <= limit)
      );
    }
    if (rule.operator === "equals" && typeof value === "number")
      return (
        !!rule.value.trim() &&
        Number.isFinite(value) &&
        Number.isFinite(Number(rule.value)) &&
        value === Number(rule.value)
      );
    const actual = String(value).toLocaleLowerCase(),
      wanted = rule.value.toLocaleLowerCase();
    return rule.operator === "equals"
      ? actual === wanted
      : actual.includes(wanted);
  });
}
@Component({
  selector: "atlas-filter-builder",
  imports: [AtlasButton, AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="atlas-filter-builder" aria-label="Filter builder">
    <p>Match all conditions</p>
    @for (rule of rules(); track rule.id; let i = $index) {
      <div class="atlas-filter-rule">
        <select
          atlasInput
          [attr.aria-label]="'Field, filter ' + (i + 1)"
          [disabled]="disabled()"
          (change)="field(rule.id, $any($event.target).value)"
        >
          @for (f of fields(); track f.key) {
            <option [value]="f.key" [selected]="f.key === rule.field">
              {{ f.label }}
            </option>
          }</select
        ><select
          atlasInput
          [attr.aria-label]="'Operator, filter ' + (i + 1)"
          [disabled]="disabled()"
          (change)="patch(rule.id, { operator: $any($event.target).value })"
        >
          @for (op of operators(rule.field); track op) {
            <option [value]="op" [selected]="op === rule.operator">
              {{ operatorLabel(op) }}
            </option>
          }</select
        ><input
          atlasInput
          [attr.aria-label]="'Value, filter ' + (i + 1)"
          [type]="numeric(rule.field) ? 'number' : 'text'"
          [value]="rule.value"
          [disabled]="disabled()"
          (input)="patch(rule.id, { value: $any($event.target).value })"
        /><button
          atlasButton
          type="button"
          [disabled]="disabled()"
          [attr.aria-label]="'Remove filter ' + (i + 1)"
          (click)="remove(rule.id)"
        >
          Remove
        </button>
      </div>
    }
    <button
      atlasButton
      type="button"
      [disabled]="disabled() || !fields().length"
      (click)="add()"
    >
      Add condition</button
    ><button
      atlasButton
      type="button"
      [disabled]="disabled() || !rules().length"
      (click)="rules.set([])"
    >
      Clear filters
    </button>
    <div class="atlas-saved-views">
      <label
        >View name<input
          atlasInput
          [disabled]="disabled()"
          [value]="name()"
          (input)="name.set($any($event.target).value)" /></label
      ><button
        atlasButton
        type="button"
        [disabled]="disabled() || !name().trim()"
        (click)="saveRequested.emit(name().trim()); name.set('')"
      >
        Save current view
      </button>
      @for (view of views(); track view.id) {
        <button
          atlasButton
          type="button"
          [disabled]="disabled()"
          (click)="rules.set(copy(view.rules))"
        >
          Load {{ view.name }}</button
        ><button
          atlasButton
          type="button"
          [disabled]="disabled()"
          [attr.aria-label]="'Delete view ' + view.name"
          (click)="deleteRequested.emit(view.id)"
        >
          ×
        </button>
      }
    </div>
  </section>`,
})
export class AtlasFilterBuilder {
  readonly fields = input.required<readonly AtlasFilterField[]>();
  readonly rules = model<AtlasFilterRule[]>([]);
  readonly views = input<readonly AtlasSavedView[]>([]);
  readonly disabled = input(false);
  readonly saveRequested = output<string>();
  readonly deleteRequested = output<string>();
  readonly name = signal("");
  private sequence = 0;
  operatorLabel(operator: AtlasFilterOperator) {
    return {
      contains: "contains",
      equals: "is equal to",
      gte: "is at least",
      lte: "is at most",
    }[operator];
  }
  numeric(key: string) {
    return this.fields().find((f) => f.key === key)?.type === "number";
  }
  operators(key: string): AtlasFilterOperator[] {
    return this.numeric(key)
      ? ["equals", "gte", "lte"]
      : ["contains", "equals"];
  }
  patch(id: string, patch: Partial<AtlasFilterRule>) {
    if (!this.disabled())
      this.rules.update((r) =>
        r.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      );
  }
  field(id: string, key: string) {
    this.patch(id, { field: key, operator: this.operators(key)[0], value: "" });
  }
  add() {
    if (this.disabled() || !this.fields().length) return;
    let id: string;
    do {
      id = `filter-${++this.sequence}`;
    } while (this.rules().some((r) => r.id === id));
    const field = this.fields()[0].key;
    this.rules.update((r) => [
      ...r,
      { id, field, operator: this.operators(field)[0], value: "" },
    ]);
  }
  remove(id: string) {
    if (!this.disabled())
      this.rules.update((r) => r.filter((rule) => rule.id !== id));
  }
  copy(rules: AtlasFilterRule[]) {
    return structuredClone(rules);
  }
}
