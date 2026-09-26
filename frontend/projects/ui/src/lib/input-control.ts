import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from "@angular/core";
import { NG_VALUE_ACCESSOR } from "@angular/forms";
import { AtlasValueControl } from "./value-control";
import { AtlasIcon } from "./primitives";

@Component({
  selector: "atlas-text-input",
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AtlasTextInput),
      multi: true,
    },
  ],
  host: { class: "atlas-control", "[class.is-disabled]": "disabled()" },
  template: `<div
    class="atlas-input-shell"
    [class.is-invalid]="invalid()"
    [class.is-readonly]="readonly()"
  >
    @if (icon()) {
      <atlas-icon [name]="icon()" />
    }
    @if (prefix()) {
      <span class="atlas-input-addon">{{ prefix() }}</span>
    }
    <input
      [id]="controlId()"
      [type]="type() === 'password' && revealed() ? 'text' : type()"
      [value]="value() ?? ''"
      [disabled]="disabled()"
      [readOnly]="readonly()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid()"
      [attr.autocomplete]="autocomplete()"
      [attr.maxlength]="maxLength()"
      (input)="edit($any($event.target).value)"
      (blur)="markTouched()"
    />
    @if (clearable() && value() && !readonly() && !disabled()) {
      <button
        type="button"
        class="atlas-control-action"
        [attr.aria-label]="'Clear ' + (ariaLabel() || 'input')"
        (click)="clear()"
      >
        <atlas-icon name="close" />
      </button>
    }
    @if (type() === "password") {
      <button
        type="button"
        class="atlas-control-action password-action"
        [disabled]="disabled()"
        [attr.aria-label]="revealed() ? 'Hide password' : 'Show password'"
        [attr.aria-pressed]="revealed()"
        (click)="revealed.set(!revealed())"
      >
        {{ revealed() ? "Hide" : "Show" }}
      </button>
    }
    @if (suffix()) {
      <span class="atlas-input-addon">{{ suffix() }}</span>
    }
  </div>`,
})
export class AtlasTextInput extends AtlasValueControl<string> {
  readonly type = input<
    "text" | "email" | "password" | "tel" | "url" | "search"
  >("text");
  readonly icon = input("");
  readonly prefix = input("");
  readonly suffix = input("");
  readonly clearable = input(false);
  readonly autocomplete = input("off");
  readonly maxLength = input<number | null>(null);
  readonly revealed = signal(false);
  edit(value: string) {
    this.commit(value);
  }
  clear() {
    this.commit("");
    this.markTouched();
  }
}

@Component({
  selector: "atlas-number-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AtlasNumberInput),
      multi: true,
    },
  ],
  host: { class: "atlas-control", "[class.is-disabled]": "disabled()" },
  template: `<div
    class="atlas-input-shell"
    [class.is-invalid]="invalid()"
    [class.is-readonly]="readonly()"
  >
    @if (prefix()) {
      <span class="atlas-input-addon">{{ prefix() }}</span>
    }
    <input
      type="number"
      [id]="controlId()"
      [value]="value() ?? ''"
      [disabled]="disabled()"
      [readOnly]="readonly()"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid()"
      (input)="edit($any($event.target).value)"
      (blur)="markTouched()"
    />
    @if (suffix()) {
      <span class="atlas-input-addon">{{ suffix() }}</span>
    }
    @if (showButtons()) {
      <div class="atlas-number-buttons">
        <button
          type="button"
          [disabled]="
            disabled() ||
            readonly() ||
            (value() !== null && max() !== null && value()! >= max()!)
          "
          aria-label="Increase value"
          (click)="increment(1)"
        >
          +</button
        ><button
          type="button"
          [disabled]="
            disabled() ||
            readonly() ||
            (value() !== null && min() !== null && value()! <= min()!)
          "
          aria-label="Decrease value"
          (click)="increment(-1)"
        >
          −
        </button>
      </div>
    }
  </div>`,
})
export class AtlasNumberInput extends AtlasValueControl<number> {
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input(1);
  readonly prefix = input("");
  readonly suffix = input("");
  readonly showButtons = input(true);
  edit(value: string) {
    this.commit(
      value === ""
        ? null
        : Number.isFinite(Number(value))
          ? Number(value)
          : null,
    );
  }
  increment(direction: number) {
    const next = Number(
      ((this.value() ?? 0) + direction * this.step()).toFixed(10),
    );
    this.commit(
      Math.min(this.max() ?? Infinity, Math.max(this.min() ?? -Infinity, next)),
    );
    this.markTouched();
  }
}
