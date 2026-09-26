import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from "@angular/core";
import { FormCheckboxControl, FormValueControl } from "@angular/forms/signals";

@Component({
  selector: "atlas-textarea",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <textarea
      #native
      class="atlas-input atlas-textarea"
      [id]="controlId()"
      [attr.aria-label]="ariaLabel()"
      [value]="value()"
      [rows]="rows()"
      [disabled]="disabled()"
      [readOnly]="readonly()"
      [required]="required()"
      [attr.maxlength]="maxLength()"
      [placeholder]="placeholder()"
      [attr.aria-invalid]="invalid() && touched()"
      [attr.aria-describedby]="describedBy()"
      (input)="edit($any($event.target).value)"
      (blur)="touch.emit()"
    ></textarea>
    @if (showCount()) {
      <span class="atlas-textarea-count"
        >{{ value().length
        }}{{
          maxLength() === undefined ? " characters" : " / " + maxLength()
        }}</span
      >
    }
  `,
  host: { class: "atlas-control" },
})
export class AtlasTextarea implements FormValueControl<string> {
  readonly controlId = input.required<string>();
  readonly ariaLabel = input<string>();
  readonly describedBy = input<string>();
  readonly value = model("");
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly required = input(false);
  readonly placeholder = input("");
  readonly maxLength = input<number>();
  readonly rows = input(4);
  readonly showCount = input(true);
  readonly touch = output<void>();
  private readonly native =
    viewChild.required<ElementRef<HTMLTextAreaElement>>("native");
  edit(value: string) {
    if (!this.disabled() && !this.readonly()) this.value.set(value);
  }
  focus(options?: FocusOptions) {
    this.native().nativeElement.focus(options);
  }
}

@Component({
  selector: "atlas-toggle",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    #native
    type="button"
    role="switch"
    class="atlas-toggle"
    [id]="controlId()"
    [disabled]="disabled()"
    [attr.aria-checked]="checked()"
    [attr.aria-readonly]="readonly()"
    [attr.aria-label]="label()"
    [attr.aria-describedby]="describedBy()"
    [attr.aria-invalid]="invalid() && touched()"
    (click)="toggle()"
    (blur)="touch.emit()"
  >
    <span class="atlas-toggle-track" aria-hidden="true"><span></span></span
    ><span>{{ label() }}</span>
  </button>`,
})
export class AtlasToggle implements FormCheckboxControl {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly describedBy = input<string>();
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output<void>();
  private readonly native =
    viewChild.required<ElementRef<HTMLButtonElement>>("native");
  toggle() {
    if (!this.disabled() && !this.readonly())
      this.checked.update((value) => !value);
  }
  focus(options?: FocusOptions) {
    this.native().nativeElement.focus(options);
  }
}
