import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import { AtlasIcon } from "./primitives";
import {
  AtlasLookupColumn,
  filterLookup,
  lookupCell,
  nextLookupIndex,
} from "./lookup-model";

/** A record picker: commit a stable key while displaying a human-readable record label. */
@Component({
  selector: "atlas-lookup",
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-control", "(window:resize)": "close(false)" },
  template: `
    <div
      class="atlas-select-shell"
      [class.is-invalid]="invalid() && touched()"
      [class.is-readonly]="readonly()"
    >
      <button
        #trigger
        type="button"
        role="combobox"
        aria-haspopup="grid"
        class="atlas-select-trigger"
        [id]="controlId()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-expanded]="opened()"
        [attr.aria-controls]="controlId() + '-grid'"
        [attr.aria-readonly]="readonly()"
        [attr.aria-required]="required()"
        [attr.aria-invalid]="invalid() && touched()"
        (click)="open()"
        (keydown)="triggerKey($event)"
        (blur)="!opened() && touch.emit()"
      >
        <span [class.atlas-placeholder]="value() === null">{{
          selectedLabel()
        }}</span
        ><atlas-icon name="down" />
      </button>
      @if (clearable() && value() !== null && !disabled() && !readonly()) {
        <button
          type="button"
          class="atlas-select-clear atlas-control-action"
          [attr.aria-label]="'Clear ' + ariaLabel()"
          (click)="clear()"
        >
          <atlas-icon name="close" />
        </button>
      }
    </div>
    <div
      #popup
      popover="auto"
      class="atlas-select-popover atlas-lookup-popover"
      (toggle)="onToggle($event)"
      (keydown)="popupKey($event)"
    >
      <div class="atlas-select-search">
        <atlas-icon name="search" />
        <input
          #search
          type="text"
          role="combobox"
          aria-haspopup="grid"
          aria-expanded="true"
          [attr.aria-label]="'Search ' + ariaLabel()"
          placeholder="Search across columns…"
          [attr.aria-controls]="controlId() + '-grid'"
          [attr.aria-activedescendant]="activeId()"
          [value]="query()"
          (input)="searchFor($any($event.target).value)"
        />
      </div>
      <div #scroll class="atlas-lookup-scroll" [attr.aria-busy]="loading()">
        <div
          role="grid"
          [id]="controlId() + '-grid'"
          [attr.aria-label]="ariaLabel() + ' results'"
          aria-readonly="true"
        >
          <div
            role="row"
            class="atlas-lookup-head"
            [style.grid-template-columns]="columnWidths()"
          >
            @for (column of columns(); track column.key) {
              <span
                role="columnheader"
                [style.text-align]="column.align || 'left'"
                >{{ column.label }}</span
              >
            }
          </div>
          @if (!loading() && !error()) {
            @for (row of filtered(); track recordKey()(row); let i = $index) {
              <div
                role="row"
                class="atlas-lookup-row"
                [id]="controlId() + '-row-' + i"
                [style.grid-template-columns]="columnWidths()"
                [class.is-active]="activeIndex() === i"
                [class.is-selected]="isSelected(row)"
                [attr.aria-selected]="isSelected(row)"
                [attr.aria-disabled]="rowDisabled()(row)"
                (pointermove)="highlight(i)"
                (click)="choose(row)"
              >
                @for (column of columns(); track column.key) {
                  <span
                    role="gridcell"
                    [attr.data-label]="column.label"
                    [style.text-align]="column.align || 'left'"
                    >{{ cell(row, column) }}</span
                  >
                }
              </div>
            }
          }
        </div>
        @if (loading()) {
          <div class="atlas-options-empty" role="status">Loading records…</div>
        } @else if (error()) {
          <div class="atlas-options-empty" role="alert">
            {{ error() }}
            <button
              #retryButton
              type="button"
              class="atlas-button"
              (click)="retryLoad()"
            >
              Retry
            </button>
          </div>
        } @else if (!filtered().length) {
          <div class="atlas-options-empty" role="status">
            No matching records. Try another search.
          </div>
        }
      </div>
      @if(remote()) {
        <div class="atlas-select-help">
          <button type="button" tabindex="-1" [disabled]="loading() || page()===0" (click)="pageChange.emit(page()-1)" aria-label="Previous lookup page" aria-keyshortcuts="PageUp">Previous</button>
          <span>{{total()}} matches · Page {{page()+1}}</span>
          <button type="button" tabindex="-1" [disabled]="loading() || (page()+1)*pageSize()>=total()" (click)="pageChange.emit(page()+1)" aria-label="Next lookup page" aria-keyshortcuts="PageDown">Next</button>
        </div>
      }
      <div class="atlas-select-help">
        <span aria-live="polite">{{
          loading() || error()
            ? "No results available"
            : filtered().length + " records"
        }}</span
        ><span>↑ ↓ navigate · Enter selects · Esc cancels @if(remote()){ · PageUp/Down pages }</span>
      </div>
    </div>
  `,
})
export class AtlasLookup<T, V extends string | number = string>
  implements FormValueControl<V | null>, OnDestroy
{
  readonly controlId = input.required<string>();
  readonly ariaLabel = input("Record");
  readonly describedBy = input<string>();
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly AtlasLookupColumn<T>[]>();
  readonly recordKey = input.required<(row: T) => V>();
  readonly displayWith = input.required<(row: T) => string>();
  readonly rowDisabled = input<(row: T) => boolean>(() => false);
  readonly value = model<V | null>(null);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly required = input(false);
  readonly clearable = input(true);
  readonly arrowNavigation = input<"open" | "grid">("open");
  readonly placeholder = input("Choose a record");
  readonly loading = input(false);
  readonly error = input("");
  readonly popupWidth = input(640);
  readonly touch = output<void>();
  readonly recordSelected = output<T | null>();
  readonly retry = output<void>();
  readonly remote = input(false);
  readonly selectedText = input('');
  readonly page = input(0);
  readonly total = input(0);
  readonly pageSize = input(20);
  readonly queryChange = output<string>();
  readonly pageChange = output<number>();
  readonly opened = signal(false);
  readonly query = signal("");
  readonly activeIndex = signal(-1);
  readonly filtered = computed(() =>
    this.remote() ? [...this.rows()] : filterLookup(this.rows(), this.columns(), this.query()),
  );
  readonly selected = computed(() =>
    this.rows().find((row) => this.isSelected(row)),
  );
  readonly selectedLabel = computed(() => {
    const selected = this.selected();
    return selected
      ? this.displayWith()(selected)
      : this.value() === null
        ? this.placeholder()
        : this.selectedText() || `Unavailable record (${this.value()})`;
  });
  readonly activeId = computed(() =>
    !this.loading() && !this.error() && this.filtered()[this.activeIndex()]
      ? `${this.controlId()}-row-${this.activeIndex()}`
      : null,
  );
  readonly columnWidths = computed(() =>
    this.columns()
      .map((column) =>
        column.width ? `${Math.max(40, column.width)}px` : "minmax(130px, 1fr)",
      )
      .join(" "),
  );
  readonly cell = lookupCell;
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>("trigger");
  private readonly popup =
    viewChild.required<ElementRef<HTMLDivElement>>("popup");
  private readonly search =
    viewChild.required<ElementRef<HTMLInputElement>>("search");
  private readonly retryButton =
    viewChild<ElementRef<HTMLButtonElement>>("retryButton");
  private readonly scroll =
    viewChild.required<ElementRef<HTMLDivElement>>("scroll");
  private readonly onScroll = (event: Event) => {
    if (!this.popup().nativeElement.contains(event.target as Node))
      this.close(false);
  };
  constructor() {
    effect(() => {
      if ((this.disabled() || this.readonly()) && this.opened())
        this.close(false);
    });
    effect(() => {
      const rows = this.filtered();
      this.activeIndex.set(
        nextLookupIndex(rows, -1, "Home", this.rowDisabled()),
      );
    });
  }
  isSelected(row: T) {
    return Object.is(this.recordKey()(row), this.value());
  }
  focus(options?: FocusOptions) {
    this.trigger().nativeElement.focus(options);
  }
  open() {
    if (this.disabled() || this.readonly()) return;
    if (this.opened()) {
      this.close(true);
      return;
    }
    this.query.set("");
    if(this.remote())this.queryChange.emit("");
    const selected = this.rows().findIndex(
      (row) => this.isSelected(row) && !this.rowDisabled()(row),
    );
    this.activeIndex.set(
      selected >= 0
        ? selected
        : nextLookupIndex(this.rows(), -1, "Home", this.rowDisabled()),
    );
    const popup = this.popup().nativeElement;
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const win = popup.ownerDocument.defaultView!;
    const mobile = this.trigger()
      .nativeElement.closest(".mobile-workspace")
      ?.getBoundingClientRect();
    const bounds = mobile ?? {
      left: 0,
      top: 0,
      right: win.innerWidth,
      bottom: win.innerHeight,
      width: win.innerWidth,
      height: win.innerHeight,
    };
    const width = Math.min(
      Math.max(rect.width, this.popupWidth()),
      bounds.width - 16,
    );
    const below = bounds.bottom - rect.bottom - 12,
      above = rect.top - bounds.top - 12;
    const down = below >= Math.min(380, above);
    Object.assign(popup.style, {
      left: `${Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - width - 8))}px`,
      width: `${width}px`,
      top: mobile
        ? `${bounds.top + 8}px`
        : down
          ? `${rect.bottom + 5}px`
          : "auto",
      bottom: mobile || down ? "auto" : `${win.innerHeight - rect.top + 5}px`,
      maxHeight: `${mobile ? Math.max(0, bounds.height - 16) : Math.max(0, Math.min(380, down ? below : above))}px`,
    });
    popup.showPopover();
    this.opened.set(true);
    this.search().nativeElement.focus({ preventScroll: true });
    popup.ownerDocument.addEventListener("scroll", this.onScroll, true);
  }
  close(restoreFocus: boolean) {
    if (!this.opened()) return;
    this.popup().nativeElement.hidePopover();
    this.opened.set(false);
    this.detach();
    this.touch.emit();
    if (restoreFocus) this.focus({ preventScroll: true });
  }
  onToggle(event: Event) {
    if ((event as ToggleEvent).newState === "closed") {
      this.opened.set(false);
      this.detach();
      this.touch.emit();
    }
  }
  searchFor(query: string) {
    this.query.set(query);
    if(this.remote())this.queryChange.emit(query);
    this.activeIndex.set(
      nextLookupIndex(this.filtered(), -1, "Home", this.rowDisabled()),
    );
  }
  highlight(index: number) {
    if (!this.rowDisabled()(this.filtered()[index]))
      this.activeIndex.set(index);
  }
  choose(row: T) {
    if (
      this.disabled() ||
      this.readonly() ||
      this.loading() ||
      this.error() ||
      this.rowDisabled()(row)
    )
      return;
    this.value.set(this.recordKey()(row));
    this.recordSelected.emit(row);
    this.close(true);
  }
  clear() {
    if (this.disabled() || this.readonly()) return;
    this.value.set(null);
    this.recordSelected.emit(null);
    this.touch.emit();
    this.focus();
  }
  retryLoad() {
    this.retry.emit();
    this.search().nativeElement.focus({ preventScroll: true });
  }
  triggerKey(event: KeyboardEvent) {
    if (
      event.key === "F4" ||
      (event.altKey && event.key === "ArrowDown") ||
      (this.arrowNavigation() === "open" &&
        ["ArrowDown", "ArrowUp"].includes(event.key))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.open();
    }
  }
  popupKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key === "Tab") {
      if (
        this.error() &&
        !event.shiftKey &&
        event.target === this.search().nativeElement
      ) {
        event.preventDefault();
        this.retryButton()?.nativeElement.focus();
        return;
      }
      if (
        this.error() &&
        event.shiftKey &&
        event.target === this.retryButton()?.nativeElement
      ) {
        event.preventDefault();
        this.search().nativeElement.focus();
        return;
      }
      this.close(true);
      return;
    }
    if (this.loading() || this.error()) return;
    if(this.remote() && ['PageUp','PageDown'].includes(event.key)) {
      event.preventDefault();event.stopPropagation();
      const page=this.page()+(event.key==='PageDown'?1:-1);
      if(page>=0 && page*this.pageSize()<this.total())this.pageChange.emit(page);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      this.activeIndex.set(
        nextLookupIndex(
          this.filtered(),
          this.activeIndex(),
          event.key,
          this.rowDisabled(),
        ),
      );
      // Scroll only the results container; scrolling ancestors would detach the overlay.
      const row = this.popup().nativeElement.querySelector<HTMLElement>(
        `[id="${this.controlId()}-row-${this.activeIndex()}"]`,
      );
      if (row) {
        const scroll = this.scroll().nativeElement;
        const top =
          row.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top +
          scroll.scrollTop;
        if (top < scroll.scrollTop + 36) scroll.scrollTop = top - 36;
        else if (
          top + row.offsetHeight >
          scroll.scrollTop + scroll.clientHeight
        )
          scroll.scrollTop = top + row.offsetHeight - scroll.clientHeight;
      }
    } else if (
      event.key === "Enter" &&
      event.target === this.search().nativeElement
    ) {
      event.preventDefault();
      const row = this.filtered()[this.activeIndex()];
      if (row) this.choose(row);
    }
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
