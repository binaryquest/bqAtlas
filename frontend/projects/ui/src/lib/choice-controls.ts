import { nextLookupIndex } from "./lookup-model";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  inject,
  model,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import { AtlasOption, filterCollection } from "./collection";
import { AtlasIcon } from "./primitives";
import { toggleChoice } from "./entry-model";

@Directive()
export abstract class AtlasChoiceState {
  readonly controlId = input.required<string>();
  readonly label = input("Options");
  readonly options = input<readonly AtlasOption<string>[]>([]);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly describedBy = input<string>();
  readonly touch = output<void>();
  guardReadonly(event: Event) {
    if (this.readonly()) event.preventDefault();
  }
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  focus(options?: FocusOptions) {
    this.hostElement.nativeElement
      .querySelector<HTMLInputElement>("input:not(:disabled)")
      ?.focus(options);
  }
}
@Component({
  selector: "atlas-checkbox-group",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset
    class="atlas-choice-group"
    [id]="controlId()"
    [disabled]="disabled()"
    [attr.aria-describedby]="describedBy()"
    [attr.aria-invalid]="invalid() && touched()"
  >
    <legend>{{ label() }}</legend>
    @for (option of options(); track option.value) {
      <label
        ><input
          type="checkbox"
          [checked]="value().includes(option.value)"
          [disabled]="option.disabled || blocked(option.value)"
          [attr.aria-readonly]="readonly()"
          (click)="guardReadonly($event)"
          (change)="choose(option)"
          (blur)="touch.emit()"
        /><span
          >{{ option.label }}
          @if (option.description) {
            <small>{{ option.description }}</small>
          }
        </span></label
      >
    }
    @if (limit()) {
      <small>{{ value().length }} / {{ limit() }} selected</small>
    }
  </fieldset>`,
})
export class AtlasCheckboxGroup
  extends AtlasChoiceState
  implements FormValueControl<string[]>
{
  readonly value = model<string[]>([]);
  readonly limit = input(0);
  blocked(key: string) {
    return (
      this.limit() > 0 &&
      this.value().length >= this.limit() &&
      !this.value().includes(key)
    );
  }
  choose(option: AtlasOption) {
    if (!this.disabled() && !this.readonly() && !option.disabled)
      this.value.set(toggleChoice(this.value(), option.value, this.limit()));
  }
}
@Component({
  selector: "atlas-radio-group",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset
    class="atlas-choice-group"
    [id]="controlId()"
    [disabled]="disabled()"
    [attr.aria-describedby]="describedBy()"
    [attr.aria-invalid]="invalid() && touched()"
  >
    <legend>{{ label() }}</legend>
    @for (option of options(); track option.value) {
      <label
        ><input
          type="radio"
          [name]="controlId()"
          [value]="option.value"
          [checked]="value() === option.value"
          [disabled]="option.disabled"
          [attr.aria-readonly]="readonly()"
          (click)="guardReadonly($event)"
          (keydown)="readonlyKey($event)"
          (change)="choose(option)"
          (blur)="touch.emit()"
        /><span
          >{{ option.label }}
          @if (option.description) {
            <small>{{ option.description }}</small>
          }
        </span></label
      >
    }
  </fieldset>`,
})
export class AtlasRadioGroup
  extends AtlasChoiceState
  implements FormValueControl<string | null>
{
  readonly value = model<string | null>(null);
  choose(option: AtlasOption) {
    if (!this.disabled() && !this.readonly() && !option.disabled)
      this.value.set(option.value);
  }
  readonlyKey(event: KeyboardEvent) {
    if (
      this.readonly() &&
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", " "].includes(
        event.key,
      )
    )
      event.preventDefault();
  }
}

@Directive()
export abstract class AtlasChoiceOverlay
  extends AtlasChoiceState
  implements OnDestroy
{
  readonly loading = input(false);
  readonly opened = signal(false);
  readonly query = signal("");
  readonly filtered = computed(() =>
    filterCollection(
      this.options(),
      this.query(),
      (o) => o.label + " " + (o.description ?? ""),
    ),
  );
  protected readonly trigger =
    viewChild.required<ElementRef<HTMLElement>>("trigger");
  protected readonly popup =
    viewChild.required<ElementRef<HTMLDivElement>>("popup");
  protected readonly search =
    viewChild.required<ElementRef<HTMLInputElement>>("search");
  private readonly onScroll = (event: Event) => {
    if (!this.popup().nativeElement.contains(event.target as Node))
      this.close(false);
  };
  constructor() {
    super();
    effect(() => {
      if ((this.disabled() || this.readonly()) && this.opened())
        this.close(false);
    });
  }
  open() {
    if (this.disabled() || this.readonly() || this.opened()) return;
    const popup = this.popup().nativeElement,
      rect = this.trigger().nativeElement.getBoundingClientRect();
    const win = popup.ownerDocument.defaultView!;
    const mobileBounds = this.trigger()
      .nativeElement.closest(".mobile-workspace")
      ?.getBoundingClientRect();
    const right = mobileBounds?.right ?? win.innerWidth,
      left = mobileBounds?.left ?? 0;
    const below = (mobileBounds?.bottom ?? win.innerHeight) - rect.bottom - 12,
      above = rect.top - (mobileBounds?.top ?? 0) - 12,
      down = below >= Math.min(320, above);
    const width = Math.min(Math.max(280, rect.width), right - left - 16);
    Object.assign(popup.style, {
      left: `${Math.max(left + 8, Math.min(rect.left, right - width - 8))}px`,
      width: `${width}px`,
      top: down ? `${rect.bottom + 5}px` : "auto",
      bottom: down ? "auto" : `${win.innerHeight - rect.top + 5}px`,
      maxHeight: `${Math.max(0, Math.min(320, down ? below : above))}px`,
    });
    popup.showPopover();
    this.opened.set(true);
    this.search().nativeElement.focus({ preventScroll: true });
    popup.ownerDocument.addEventListener("scroll", this.onScroll, true);
  }
  close(focus = true) {
    if (!this.opened()) return;
    this.popup().nativeElement.hidePopover();
    this.opened.set(false);
    this.detach();
    this.touch.emit();
    if (focus) this.focus();
  }
  toggled(event: Event) {
    if ((event as ToggleEvent).newState === "closed") {
      this.opened.set(false);
      this.detach();
      this.touch.emit();
    }
  }
  override focus(options?: FocusOptions) {
    this.trigger().nativeElement.focus(options);
  }
  protected dismissKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return true;
    }
    return false;
  }
  private detach() {
    this.popup().nativeElement.ownerDocument.removeEventListener(
      "scroll",
      this.onScroll,
      true,
    );
  }
  ngOnDestroy() {
    this.detach();
  }
}
@Component({
  selector: "atlas-multi-select",
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control", "(window:resize)": "close(false)" },
  template: `<button
      #trigger
      type="button"
      class="atlas-select-trigger atlas-multi-trigger"
      [id]="controlId()"
      [disabled]="disabled()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="opened()"
      [attr.aria-controls]="controlId() + '-popup'"
      [attr.aria-label]="label()"
      [attr.aria-readonly]="readonly()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() && touched()"
      (click)="opened() ? close() : open()"
      (blur)="!opened() && touch.emit()"
    >
      <span>{{
        value().length ? value().length + " selected" : "Choose options"
      }}</span
      ><atlas-icon name="down" />
    </button>
    <div class="atlas-token-list">
      @for (key of value(); track key) {
        <span
          >{{ optionLabel(key)
          }}<button
            type="button"
            [disabled]="disabled() || readonly()"
            [attr.aria-label]="'Remove ' + optionLabel(key)"
            (click)="remove(key)"
          >
            ×
          </button></span
        >
      }
    </div>
    <div
      #popup
      popover="auto"
      role="dialog"
      [id]="controlId() + '-popup'"
      [attr.aria-label]="label() + ' selection'"
      class="atlas-select-popover"
      (toggle)="toggled($event)"
      (keydown)="key($event)"
    >
      <div class="atlas-select-search">
        <atlas-icon name="search" /><input
          #search
          type="search"
          [attr.aria-label]="'Search ' + label()"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          placeholder="Search options…"
        />
      </div>
      <div class="atlas-choice-results">
        @if (loading()) {
          <p role="status">Loading options…</p>
        } @else {
          @for (option of filtered(); track option.value) {
            <label
              ><input
                type="checkbox"
                [checked]="value().includes(option.value)"
                [disabled]="option.disabled || blocked(option.value)"
                (change)="choose(option)"
              /><span
                >{{ option.label }}<small>{{ option.description }}</small></span
              ></label
            >
          } @empty {
            <p role="status">No matching options.</p>
          }
        }
      </div>
      <div class="atlas-multi-footer">
        <span aria-live="polite"
          >{{ value().length }} selected{{
            limit() ? " / " + limit() : ""
          }}</span
        ><button type="button" (click)="clear()">Clear</button
        ><button type="button" (click)="close()">Done</button>
      </div>
    </div>`,
})
export class AtlasMultiSelect
  extends AtlasChoiceOverlay
  implements FormValueControl<string[]>
{
  readonly value = model<string[]>([]);
  readonly limit = input(0);
  optionLabel(key: string) {
    return this.options().find((o) => o.value === key)?.label ?? key;
  }
  blocked(key: string) {
    return (
      this.limit() > 0 &&
      this.value().length >= this.limit() &&
      !this.value().includes(key)
    );
  }
  choose(option: AtlasOption) {
    if (
      !this.disabled() &&
      !this.readonly() &&
      !this.loading() &&
      !option.disabled
    )
      this.value.set(toggleChoice(this.value(), option.value, this.limit()));
  }
  remove(key: string) {
    if (!this.disabled() && !this.readonly()) {
      this.value.update((v) => v.filter((k) => k !== key));
      this.touch.emit();
    }
  }
  clear() {
    if (!this.disabled() && !this.readonly()) {
      this.value.set([]);
      this.touch.emit();
    }
  }
  key(event: KeyboardEvent) {
    if (this.dismissKey(event)) return;
    if (event.key === "Tab") {
      const buttons = Array.from(
        this.popup().nativeElement.querySelectorAll<HTMLElement>(
          "input:not(:disabled),button:not(:disabled)",
        ),
      );
      if (
        (event.shiftKey && event.target === buttons[0]) ||
        (!event.shiftKey && event.target === buttons.at(-1))
      )
        this.close();
    }
  }
}
@Component({
  selector: "atlas-autocomplete",
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control", "(window:resize)": "close(false)" },
  template: `<div #trigger class="atlas-select-shell">
      <input
        class="atlas-input"
        [id]="controlId()"
        [value]="display()"
        [disabled]="disabled()"
        [readOnly]="readonly()"
        role="combobox"
        aria-haspopup="listbox"
        [attr.aria-expanded]="opened()"
        [attr.aria-controls]="controlId() + '-list'"
        [attr.aria-label]="label()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid() && touched()"
        placeholder="Type to find a record…"
        (input)="type($any($event.target).value)"
        (keydown.arrowdown)="$event.preventDefault(); open()"
        (blur)="!opened() && touch.emit()"
      /><button
        type="button"
        class="atlas-control-action"
        [disabled]="disabled() || readonly()"
        [attr.aria-label]="'Clear ' + label()"
        (click)="clear()"
      >
        <atlas-icon name="close" />
      </button>
    </div>
    <div
      #popup
      popover="auto"
      class="atlas-select-popover"
      (toggle)="toggled($event)"
      (keydown)="key($event)"
    >
      <div class="atlas-select-search">
        <input
          #search
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          [attr.aria-label]="'Search ' + label()"
          [attr.aria-controls]="controlId() + '-list'"
          [attr.aria-activedescendant]="
            !loading() && filtered()[active()]
              ? controlId() + '-option-' + active()
              : null
          "
          [value]="query()"
          (input)="query.set($any($event.target).value); active.set(first())"
        />
      </div>
      <div
        class="atlas-select-options"
        role="listbox"
        [id]="controlId() + '-list'"
        [attr.aria-label]="label() + ' suggestions'"
      >
        @if (loading()) {
          <p class="atlas-options-empty" role="status">Loading suggestions…</p>
        } @else {
          @for (option of filtered(); track option.value; let i = $index) {
            <button
              type="button"
              role="option"
              tabindex="-1"
              class="atlas-select-option"
              [id]="controlId() + '-option-' + i"
              [disabled]="option.disabled"
              [attr.aria-selected]="value() === option.value"
              [class.is-active]="active() === i"
              (click)="choose(option)"
            >
              <span
                ><strong>{{ option.label }}</strong
                ><small>{{ option.description }}</small></span
              >
            </button>
          } @empty {
            <p class="atlas-options-empty" role="status">
              No matching suggestions.
            </p>
          }
        }
      </div>
      <div class="atlas-select-help">
        Enter selects · Escape keeps the previous value
      </div>
    </div>`,
})
export class AtlasAutocomplete
  extends AtlasChoiceOverlay
  implements FormValueControl<string | null>
{
  readonly value = model<string | null>(null);
  readonly active = signal(0);
  readonly display = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? "",
  );
  first() {
    return this.filtered().findIndex((o) => !o.disabled);
  }
  type(text: string) {
    this.query.set(text);
    this.active.set(this.first());
    this.open();
  }
  override open() {
    super.open();
    this.active.set(this.first());
  }
  override focus(options?: FocusOptions) {
    this.trigger().nativeElement.querySelector("input")?.focus(options);
  }
  choose(option: AtlasOption) {
    if (this.disabled() || this.readonly() || this.loading() || option.disabled)
      return;
    this.value.set(option.value);
    this.close();
  }
  override close(focus = true) {
    super.close(focus);
    const native = this.trigger().nativeElement.querySelector("input");
    if (native) native.value = this.display();
  }
  override toggled(event: Event) {
    super.toggled(event);
    if ((event as ToggleEvent).newState === "closed") {
      const native = this.trigger().nativeElement.querySelector("input");
      if (native) native.value = this.display();
    }
  }
  clear() {
    if (!this.disabled() && !this.readonly()) {
      this.value.set(null);
      this.query.set("");
      this.touch.emit();
      this.focus();
    }
  }
  key(event: KeyboardEvent) {
    if (this.dismissKey(event)) return;
    if (event.key === "Tab") {
      this.close();
      return;
    }
    if (this.loading()) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      this.active.set(
        nextLookupIndex(
          this.filtered(),
          this.active(),
          event.key,
          (o) => !!o.disabled,
        ),
      );
      const row = this.popup().nativeElement.querySelector<HTMLElement>(
        `[id="${this.controlId()}-option-${this.active()}"]`,
      );
      const scroll = row?.parentElement;
      if (row && scroll) {
        const top =
          row.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top +
          scroll.scrollTop;
        if (top < scroll.scrollTop) scroll.scrollTop = top;
        else if (
          top + row.offsetHeight >
          scroll.scrollTop + scroll.clientHeight
        )
          scroll.scrollTop = top + row.offsetHeight - scroll.clientHeight;
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = this.filtered()[this.active()];
      if (option) this.choose(option);
    }
  }
}
