import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  output,
  viewChild,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import {
  AtlasDateRange,
  dateRangeError,
  parseLocaleNumber,
} from "./entry-model";

@Directive()
export abstract class AtlasEntryState {
  readonly controlId = input.required<string>();
  readonly label = input("Value");
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly describedBy = input<string>();
  readonly touch = output<void>();
  protected readonly native =
    viewChild.required<ElementRef<HTMLInputElement>>("native");
  focus(options?: FocusOptions) {
    this.native().nativeElement.focus(options);
  }
}
@Component({
  selector: "atlas-date-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control" },
  template: `<input
    #native
    class="atlas-input"
    type="date"
    [id]="controlId()"
    [attr.aria-label]="label()"
    [attr.aria-describedby]="describedBy()"
    [attr.aria-invalid]="invalid() && touched()"
    [value]="value()"
    [min]="minDate()"
    [max]="maxDate()"
    [disabled]="disabled()"
    [readOnly]="readonly()"
    (input)="edit($any($event.target).value)"
    (blur)="touch.emit()"
  />`,
})
export class AtlasDateInput
  extends AtlasEntryState
  implements FormValueControl<string>
{
  readonly value = model("");
  readonly minDate = input("");
  readonly maxDate = input("");
  edit(value: string) {
    if (!this.disabled() && !this.readonly()) this.value.set(value);
  }
}
@Component({
  selector: "atlas-date-range",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control" },
  template: `<fieldset
      class="atlas-date-range"
      [attr.aria-invalid]="touched() && !!rangeError()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy()"
    >
      <legend>{{ label() }}</legend>
      <label
        >From<input
          #native
          class="atlas-input"
          type="date"
          [id]="controlId()"
          [attr.aria-label]="label() + ' start'"
          [value]="value().start"
          [min]="minDate()"
          [max]="maxDate()"
          [readOnly]="readonly()"
          (input)="edit('start', $any($event.target).value)"
          (blur)="touch.emit()" /></label
      ><label
        >To<input
          class="atlas-input"
          type="date"
          [attr.aria-label]="label() + ' end'"
          [value]="value().end"
          [min]="value().start || minDate()"
          [max]="maxDate()"
          [readOnly]="readonly()"
          (input)="edit('end', $any($event.target).value)"
          (blur)="touch.emit()"
      /></label>
    </fieldset>
    @if (touched() && rangeError()) {
      <p class="atlas-field-error" role="status">{{ rangeError() }}</p>
    }`,
})
export class AtlasDateRangeInput
  extends AtlasEntryState
  implements FormValueControl<AtlasDateRange>
{
  readonly value = model<AtlasDateRange>({ start: "", end: "" });
  readonly minDate = input("");
  readonly maxDate = input("");
  readonly rangeError = computed(() =>
    dateRangeError(this.value(), this.minDate(), this.maxDate()),
  );
  edit(key: "start" | "end", value: string) {
    if (!this.disabled() && !this.readonly())
      this.value.update((v) => ({ ...v, [key]: value }));
  }
}
@Component({
  selector: "atlas-decimal-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control" },
  template: `<div
      class="atlas-input-shell"
      [class.is-invalid]="parseError() || (invalid() && touched())"
    >
      @if (currency()) {
        <span class="atlas-input-affix">{{ currency() }}</span>
      }
      <input
        #native
        type="text"
        inputmode="decimal"
        [id]="controlId()"
        [attr.aria-label]="label()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="parseError() || (invalid() && touched())"
        [disabled]="disabled()"
        [readOnly]="readonly()"
        [value]="text()"
        (input)="edit($any($event.target).value)"
        (focus)="begin()"
        (blur)="finish()"
      />
    </div>
    @if (parseError()) {
      <p class="atlas-field-error" role="status">
        Enter a valid number for {{ locale() }}.
      </p>
    }`,
})
export class AtlasDecimalInput
  extends AtlasEntryState
  implements FormValueControl<number | null>
{
  readonly value = model<number | null>(null);
  readonly locale = input("en-US");
  readonly currency = input("");
  readonly fractionDigits = input(2);
  readonly parseErrorChange = output<boolean>();
  readonly text = linkedSignal(() => this.format(this.value(), true));
  readonly parseError = computed(
    () => parseLocaleNumber(this.text(), this.locale()) === undefined,
  );
  constructor() {
    super();
    effect(() => this.parseErrorChange.emit(this.parseError()));
  }
  reset() {
    this.text.set(this.format(this.value(), true));
  }
  format(value: number | null, grouping: boolean) {
    return value === null
      ? ""
      : new Intl.NumberFormat(this.locale(), {
          useGrouping: grouping,
          minimumFractionDigits: grouping ? this.fractionDigits() : 0,
          maximumFractionDigits: Math.max(this.fractionDigits(), 10),
        }).format(value);
  }
  begin() {
    if (!this.parseError()) this.text.set(this.format(this.value(), false));
  }
  edit(text: string) {
    if (this.disabled() || this.readonly()) return;
    const number = parseLocaleNumber(text, this.locale());
    if (number !== undefined) this.value.set(number);
    this.text.set(text);
  }
  finish() {
    if (!this.parseError()) this.text.set(this.format(this.value(), true));
    this.touch.emit();
  }
}
export interface AtlasValidationIssue {
  id: string;
  message: string;
}
@Component({
  selector: "atlas-validation-summary",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (issues().length) {
    <section
      class="atlas-validation-summary"
      role="alert"
      aria-label="Form validation"
    >
      <strong
        >Review {{ issues().length }}
        {{ issues().length === 1 ? "field" : "fields" }}</strong
      >
      <ul>
        @for (issue of issues(); track issue.id) {
          <li>
            <button type="button" (click)="fieldRequested.emit(issue.id)">
              {{ issue.message }}
            </button>
          </li>
        }
      </ul>
    </section>
  }`,
})
export class AtlasValidationSummary {
  readonly issues = input<readonly AtlasValidationIssue[]>([]);
  readonly fieldRequested = output<string>();
}
