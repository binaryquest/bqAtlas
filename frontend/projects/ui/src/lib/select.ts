import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  forwardRef,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { NG_VALUE_ACCESSOR } from "@angular/forms";
import { AtlasValueControl } from "./value-control";
import { AtlasOption, filterCollection } from "./collection";
import { AtlasIcon } from "./primitives";

@Component({
  selector: "atlas-select",
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AtlasSelect),
      multi: true,
    },
  ],
  host: {
    class: "atlas-control",
    "[class.is-disabled]": "disabled()",
    "(window:resize)": "close(false)",
  },
  template: `<div
      class="atlas-select-shell"
      [class.is-invalid]="invalid()"
      [class.is-readonly]="readonly()"
    >
      <button
        #trigger
        type="button"
        class="atlas-select-trigger"
        role="combobox"
        [id]="controlId()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-expanded]="opened()"
        aria-haspopup="listbox"
        [attr.aria-controls]="controlId() + '-list'"
        [attr.aria-activedescendant]="
          opened() && activeIndex() >= 0
            ? controlId() + '-option-' + activeIndex()
            : null
        "
        [attr.aria-invalid]="invalid()"
        [attr.aria-readonly]="readonly()"
        (click)="toggle()"
        (keydown)="key($event)"
        (blur)="blur()"
      >
        <span [class.atlas-placeholder]="!selected()">{{
          selected()?.label || placeholder() || "Choose an option"
        }}</span>
        <atlas-icon [name]="loading() ? 'refresh' : 'down'" />
      </button>
      @if (clearable() && selected() && !readonly() && !disabled()) {
        <button
          type="button"
          class="atlas-select-clear atlas-control-action"
          [attr.aria-label]="'Clear ' + (ariaLabel() || 'selection')"
          (click)="clear()"
        >
          <atlas-icon name="close" />
        </button>
      }
    </div>
    <div
      #popup
      popover="auto"
      class="atlas-select-popover"
      (toggle)="toggled($event)"
      (keydown)="key($event)"
    >
      @if (filter()) {
        <div class="atlas-select-search">
          <atlas-icon name="search" /><input
            #search
            type="search"
            [attr.aria-label]="'Filter ' + (ariaLabel() || 'options')"
            [value]="query()"
            placeholder="Search options…"
            [attr.aria-controls]="controlId() + '-list'"
            [attr.aria-activedescendant]="
              activeIndex() >= 0
                ? controlId() + '-option-' + activeIndex()
                : null
            "
            (input)="searchFor($any($event.target).value)"
          />
        </div>
      }
      <div
        class="atlas-select-options"
        role="listbox"
        [id]="controlId() + '-list'"
        [attr.aria-label]="ariaLabel() || 'Options'"
      >
        @if (loading()) {
          <div class="atlas-options-empty" role="status">Loading options…</div>
        } @else {
          @for (option of filtered(); track option.value; let i = $index) {
            @if (
              option.group &&
              (i === 0 || filtered()[i - 1].group !== option.group)
            ) {
              <div class="atlas-option-group">{{ option.group }}</div>
            }
            <button
              type="button"
              role="option"
              tabindex="-1"
              class="atlas-select-option"
              [id]="controlId() + '-option-' + i"
              [class.is-active]="i === activeIndex()"
              [disabled]="option.disabled"
              [attr.aria-disabled]="!!option.disabled"
              [attr.aria-selected]="value() === option.value"
              (pointermove)="hover(i)"
              (click)="choose(option)"
            >
              <span
                ><strong>{{ option.label }}</strong>
                @if (option.description) {
                  <small>{{ option.description }}</small>
                }
              </span>
              @if (value() === option.value) {
                <atlas-icon name="check" />
              }
            </button>
          } @empty {
            <div class="atlas-options-empty">No matching options.</div>
          }
        }
      </div>
      <div class="atlas-select-help">
        <span>↑ ↓ navigate</span><span>Enter to select</span>
      </div>
    </div>`,
})
export class AtlasSelect<T = string>
  extends AtlasValueControl<T>
  implements OnDestroy
{
  readonly options = input<AtlasOption<T>[]>([]);
  readonly filter = input(true);
  readonly clearable = input(true);
  readonly loading = input(false);
  readonly query = signal("");
  readonly opened = signal(false);
  readonly activeIndex = signal(-1);
  readonly selected = computed(() =>
    this.options().find((option) => Object.is(option.value, this.value())),
  );
  readonly filtered = computed(() =>
    filterCollection(
      this.options(),
      this.query(),
      (option) =>
        `${option.label} ${option.description ?? ""} ${option.group ?? ""}`,
    ),
  );
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>("trigger");
  private readonly popup =
    viewChild.required<ElementRef<HTMLDivElement>>("popup");
  private readonly search = viewChild<ElementRef<HTMLInputElement>>("search");
  private readonly onScroll = (event: Event) => {
    if (!this.popup().nativeElement.contains(event.target as Node))
      this.close(false);
  };
  toggle() {
    this.opened() ? this.close(true) : this.open();
  }
  open() {
    if (this.disabled() || this.readonly() || this.loading()) return;
    this.query.set("");
    const index = this.options().findIndex(
      (option) => Object.is(option.value, this.value()) && !option.disabled,
    );
    this.activeIndex.set(
      index >= 0
        ? index
        : this.options().findIndex((option) => !option.disabled),
    );
    const popup = this.popup().nativeElement;
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const win = popup.ownerDocument.defaultView!;
    const below = win.innerHeight - rect.bottom - 10,
      above = rect.top - 10;
    const opensBelow = below >= Math.min(310, above);
    const height = Math.min(310, opensBelow ? below : above);
    Object.assign(popup.style, {
      left: `${Math.max(8, Math.min(rect.left, win.innerWidth - Math.min(rect.width, win.innerWidth - 16) - 8))}px`,
      top: opensBelow ? `${rect.bottom + 5}px` : "auto",
      bottom: opensBelow ? "auto" : `${win.innerHeight - rect.top + 5}px`,
      width: `${Math.min(rect.width, win.innerWidth - 16)}px`,
      maxHeight: `${height}px`,
    });
    popup.showPopover();
    this.opened.set(true);
    popup.ownerDocument.addEventListener("scroll", this.onScroll, true);
    queueMicrotask(() => {
      if (this.opened()) this.search()?.nativeElement.focus();
    });
  }
  close(focus: boolean) {
    if (!this.opened()) return;
    this.popup().nativeElement.hidePopover();
    this.opened.set(false);
    this.markTouched();
    this.popup().nativeElement.ownerDocument.removeEventListener(
      "scroll",
      this.onScroll,
      true,
    );
    if (focus) this.trigger().nativeElement.focus();
  }
  toggled(event: Event) {
    const open = (event as Event & { newState: string }).newState === "open";
    this.opened.set(open);
    if (!open) {
      this.markTouched();
      this.popup().nativeElement.ownerDocument.removeEventListener(
        "scroll",
        this.onScroll,
        true,
      );
    }
  }
  blur() {
    if (!this.opened()) this.markTouched();
  }
  clear() {
    this.commit(null);
    this.markTouched();
    this.trigger().nativeElement.focus();
  }
  choose(option: AtlasOption<T>) {
    if (option.disabled) return;
    this.commit(option.value);
    this.close(true);
  }
  hover(index: number) {
    if (!this.filtered()[index]?.disabled) this.activeIndex.set(index);
  }
  searchFor(query: string) {
    this.query.set(query);
    this.activeIndex.set(
      this.filtered().findIndex((option) => !option.disabled),
    );
  }
  key(event: KeyboardEvent) {
    if (this.disabled() || this.readonly()) return;
    if (event.key === "Escape") {
      if (this.opened()) {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
      }
      return;
    }
    if (event.key === "Tab") {
      this.close(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!this.opened()) {
        this.open();
        return;
      }
      const indices = this.filtered()
        .map((option, i) => (option.disabled ? -1 : i))
        .filter((i) => i >= 0);
      if (!indices.length) return;
      const current = indices.indexOf(this.activeIndex());
      const index =
        event.key === "Home"
          ? indices[0]
          : event.key === "End"
            ? indices.at(-1)!
            : indices[
                (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  indices.length) %
                  indices.length
              ];
      this.activeIndex.set(index);
      this.popup()
        .nativeElement.querySelector<HTMLElement>(
          `[id="${this.controlId()}-option-${index}"]`,
        )
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (
      event.key === "Enter" ||
      (event.key === " " && event.target === this.trigger().nativeElement)
    ) {
      event.preventDefault();
      if (!this.opened()) {
        this.open();
        return;
      }
      const option = this.filtered()[this.activeIndex()];
      if (option) this.choose(option);
    }
  }
  override setDisabledState(disabled: boolean) {
    super.setDisabledState(disabled);
    if (disabled && this.opened()) this.close(false);
  }
  ngOnDestroy() {
    this.popup().nativeElement.ownerDocument.removeEventListener(
      "scroll",
      this.onScroll,
      true,
    );
  }
}
