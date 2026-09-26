import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { AtlasButton } from "./primitives";
export interface AtlasRecordOption {
  id: string;
  label: string;
}
@Component({
  selector: "atlas-record-navigator",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav
    class="atlas-record-navigation"
    aria-label="Record navigation"
  >
    <button
      atlasButton
      [disabled]="disabled() || index() <= 0"
      (click)="choose(0)"
    >
      First
    </button>
    <button
      atlasButton
      [disabled]="disabled() || index() <= 0"
      (click)="choose(index() - 1)"
    >
      Previous
    </button>
    <span aria-live="polite">{{ index() + 1 }} of {{ records().length }}</span>
    <button
      atlasButton
      [disabled]="disabled() || index() >= records().length - 1"
      (click)="choose(index() + 1)"
    >
      Next
    </button>
    <button
      atlasButton
      [disabled]="disabled() || index() >= records().length - 1"
      (click)="choose(records().length - 1)"
    >
      Last
    </button>
    <label
      >Find record
      <select
        [disabled]="disabled()"

        (change)="selectRecord($event)"
      >
        @for (record of records(); track record.id) {
          <option [value]="record.id" [selected]="record.id === currentId()">{{ record.label }}</option>
        }
      </select></label
    ><button atlasButton [disabled]="disabled()" (click)="create.emit()">
      New record
    </button>
  </nav>`,
})
export class AtlasRecordNavigator {
  readonly records = input.required<readonly AtlasRecordOption[]>();
  readonly currentId = input.required<string>();
  readonly disabled = input(false);
  readonly navigate = output<string>();
  readonly create = output<void>();
  selectRecord(event: Event) {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    select.value = this.currentId();
    this.request(id);
  }
  index() {
    return this.records().findIndex((r) => r.id === this.currentId());
  }
  choose(index: number) {
    const record = this.records()[index];
    if (record) this.request(record.id);
  }
  request(id: string) {
    if (
      !this.disabled() &&
      id !== this.currentId() &&
      this.records().some((r) => r.id === id)
    )
      this.navigate.emit(id);
  }
}
export interface AtlasValidationTarget {
  id: string;
  message: string;
}
@Component({
  selector: "atlas-validation-navigator",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (errors().length) {
    <section class="atlas-edit-alert" aria-label="Validation errors">
      <p role="alert">{{ errors().length }} fields need attention</p>
      <ul>
        @for (error of errors(); track error.id) {
          <li>
            <button type="button" (click)="activate.emit(error)">
              {{ error.message }}
            </button>
          </li>
        }
      </ul>
    </section>
  }`,
})
export class AtlasValidationNavigator {
  readonly errors = input.required<readonly AtlasValidationTarget[]>();
  readonly activate = output<AtlasValidationTarget>();
}
/** Consumer chooses when to clear dependent state; this helper never mutates records. */
export function dependentRecords<T, K>(
  rows: readonly T[],
  parent: K | null,
  parentKey: (row: T) => K,
): T[] {
  return parent === null
    ? []
    : rows.filter((row) => Object.is(parentKey(row), parent));
}
