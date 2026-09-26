import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
} from "@angular/core";
import {
  AbstractControl,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from "@angular/forms";
import { AtlasValueControl } from "@bqatlas/ui";
import { parseDecimalUnits } from "@bqatlas/contracts";
/** A string-valued CVA for exact amounts. Invalid draft text is preserved for correction. */
@Component({
  selector: "bqatlas-decimal-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AtlasDecimalTextInput),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => AtlasDecimalTextInput),
      multi: true,
    },
  ],
  host: { class: "atlas-control" },
  template: `<div
    class="atlas-input-shell"
    [class.is-invalid]="invalid() || invalidText()"
  >
    <input
      [attr.data-sheet-editor]="sheetEditor() ? '' : null"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      [id]="controlId()"
      [value]="value() ?? ''"
      [disabled]="disabled()"
      [readOnly]="readonly()"
      [required]="required()"
      [attr.aria-required]="required()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() || invalidText()"
      (input)="edit($any($event.target).value)"
      (blur)="markTouched()"
    />
  </div>`,
})
export class AtlasDecimalTextInput
  extends AtlasValueControl<string>
  implements Validator
{
  readonly required = input(false);
  readonly sheetEditor = input(false);
  readonly scale = input(2);
  readonly maximum = input<string>();
  readonly invalidText = computed(
    () =>
      this.value() !== null &&
      this.value() !== "" &&
      parseDecimalUnits(this.value(), this.scale(), this.maximum()) === null,
  );
  edit(value: string) {
    this.commit(value);
  }
  validate(control: AbstractControl): ValidationErrors | null {
    return control.value === null ||
      control.value === "" ||
      parseDecimalUnits(control.value, this.scale(), this.maximum()) !== null
      ? null
      : { decimal: true };
  }
}
