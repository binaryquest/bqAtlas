import { Directive, input, signal } from "@angular/core";
import { ControlValueAccessor } from "@angular/forms";

/** Shared forms contract; presentation can be native, Atlas, or an adapter. */
@Directive()
export abstract class AtlasValueControl<T> implements ControlValueAccessor {
  readonly controlId = input.required<string>();
  readonly ariaLabel = input<string | undefined>();
  readonly describedBy = input<string | undefined>();
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly placeholder = input("");
  readonly value = signal<T | null>(null);
  readonly disabled = signal(false);
  private change: (value: T | null) => void = () => {};
  private touch: () => void = () => {};
  writeValue(value: T | null) {
    this.value.set(value);
  }
  registerOnChange(callback: (value: T | null) => void) {
    this.change = callback;
  }
  registerOnTouched(callback: () => void) {
    this.touch = callback;
  }
  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }
  protected commit(value: T | null) {
    if (this.disabled() || this.readonly()) return;
    this.value.set(value);
    this.change(value);
  }
  markTouched() {
    this.touch();
  }
}
