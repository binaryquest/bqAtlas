import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { AtlasColumn } from "./table";
export function atlasVirtualRange(
  total: number,
  scroll: number,
  height: number,
  rowHeight: number,
  overscan = 4,
) {
  total = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  rowHeight = Math.max(1, Number.isFinite(rowHeight) ? rowHeight : 32);
  height = Math.max(1, Number.isFinite(height) ? height : 300);
  overscan = Math.max(
    0,
    Math.min(20, Math.floor(Number.isFinite(overscan) ? overscan : 4)),
  );
  const offset = Math.max(
    0,
    Math.min(
      Number.isFinite(scroll) ? scroll : 0,
      Math.max(0, total * rowHeight - height),
    ),
  );
  const start = Math.max(0, Math.floor(offset / rowHeight) - overscan),
    end = Math.min(total, Math.ceil((offset + height) / rowHeight) + overscan);
  return {
    start,
    end,
    top: start * rowHeight,
    bottom: Math.max(0, (total - end) * rowHeight),
  };
}
let gridSequence = 0;
@Component({
  selector: "atlas-virtual-grid",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #viewport
      class="atlas-virtual-grid"
      role="grid"
      tabindex="0"
      [attr.aria-label]="label()"
      [attr.aria-rowcount]="rows().length + 1"
      [attr.aria-colcount]="columns().length"
      [attr.aria-activedescendant]="activeDescendant()"
      [attr.aria-busy]="loading()"
      [style.height.px]="viewportHeight()"
      [style.--atlas-virtual-row-height]="size() + 'px'"
      (scroll)="scroll.set(viewport.scrollTop)"
      (keydown)="key($event)"
    >
      <table
        role="presentation"
        class="atlas-table"
        [style.min-width.px]="tableWidth()"
      >
        <colgroup>
          @for (column of columns(); track column.key) {
            <col [style.width.px]="column.width || 180" />
          }
        </colgroup>
        <thead role="rowgroup">
          <tr role="row" aria-rowindex="1">
            @for (column of columns(); track column.key) {
              <th role="columnheader">{{ column.label }}</th>
            }
          </tr>
        </thead>
        <tbody role="rowgroup">
          @if (!loading() && !error()) {
            <tr
              aria-hidden="true"
              role="presentation"
              class="atlas-virtual-spacer"
            >
              <td
                [attr.colspan]="columns().length"
                [style.height.px]="range().top"
              ></td>
            </tr>
            @for (row of visible(); track rowKey(row)) {
              <tr
                role="row"
                class="atlas-virtual-data"
                [id]="rowId(range().start + $index)"
                [attr.aria-rowindex]="range().start + $index + 2"
                [attr.aria-selected]="selectedKey() === rowKey(row)"
                [class.selected]="selectedKey() === rowKey(row)"
                (click)="select(range().start + $index)"
                (dblclick)="rowActivated.emit(row)"
              >
                @for (column of columns(); track column.key) {
                  <td
                    role="gridcell"
                    [style.text-align]="column.align || 'left'"
                    [title]="value(row, column)"
                  >
                    {{ value(row, column) }}
                  </td>
                }
              </tr>
            }
            <tr
              aria-hidden="true"
              role="presentation"
              class="atlas-virtual-spacer"
            >
              <td
                [attr.colspan]="columns().length"
                [style.height.px]="range().bottom"
              ></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (loading()) {
      <p role="status">Loading records…</p>
    } @else if (error()) {
      <p role="alert">{{ error() }}</p>
      <button type="button" (click)="retry.emit()">Retry</button>
    } @else if (!rows().length) {
      <p role="status">No matching records.</p>
    }
    <p class="atlas-muted" role="status">
      {{ rows().length }} records · {{ visible().length }} rendered rows. Arrow
      keys, Page Up/Down, Home/End navigate; Enter opens a record.
    </p>
  `,
})
export class AtlasVirtualGrid<T extends object> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly AtlasColumn<T>[]>();
  readonly keyField = input.required<keyof T>();
  readonly label = input("Virtual grid");
  readonly height = input(360);
  readonly rowHeight = input(36);
  readonly loading = input(false);
  readonly error = input("");
  readonly retry = output<void>();
  readonly selectedKey = model<string | null>(null);
  readonly rowActivated = output<T>();
  readonly scroll = signal(0);
  readonly viewport = viewChild<ElementRef<HTMLElement>>("viewport");
  readonly id = `atlas-virtual-${++gridSequence}`;
  readonly size = computed(() =>
    Math.max(
      24,
      Math.min(80, Number.isFinite(this.rowHeight()) ? this.rowHeight() : 36),
    ),
  );
  readonly viewportHeight = computed(() =>
    Math.max(
      160,
      Math.min(800, Number.isFinite(this.height()) ? this.height() : 360),
    ),
  );
  readonly range = computed(() =>
    atlasVirtualRange(
      this.rows().length,
      this.scroll(),
      this.viewportHeight() - 32,
      this.size(),
    ),
  );
  readonly visible = computed(() =>
    this.loading() || this.error()
      ? []
      : this.rows().slice(this.range().start, this.range().end),
  );
  readonly activeIndex = computed(() =>
    this.rows().findIndex((row) => this.rowKey(row) === this.selectedKey()),
  );
  readonly activeDescendant = computed(() =>
    !this.loading() &&
    !this.error() &&
    this.activeIndex() >= this.range().start &&
    this.activeIndex() < this.range().end
      ? this.rowId(this.activeIndex())
      : null,
  );
  readonly tableWidth = computed(() =>
    this.columns().reduce((sum, column) => sum + (column.width || 180), 0),
  );
  constructor() {
    effect(() => {
      this.rows();
      this.size();
      const viewport = this.viewport()?.nativeElement;
      if (!viewport) return;
      viewport.scrollTop = 0;
      this.scroll.set(0);
    });
  }
  rowId(index: number) {
    return `${this.id}-${index}`;
  }
  rowKey(row: T) {
    return String(row[this.keyField()]);
  }
  value(row: T, column: AtlasColumn<T>) {
    return column.format ? column.format(row) : String(row[column.key] ?? "");
  }
  select(index: number) {
    if (this.loading() || this.error() || !this.rows()[index]) return;
    this.selectedKey.set(this.rowKey(this.rows()[index]));
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    const top = index * this.size(),
      bottom = top + this.size();
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + this.viewportHeight() - 32)
      viewport.scrollTop = bottom - (this.viewportHeight() - 32);
    this.scroll.set(viewport.scrollTop);
    viewport.focus();
  }
  key(event: KeyboardEvent) {
    if (this.loading() || this.error() || !this.rows().length) return;
    const index = this.activeIndex();
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = index + 1;
        break;
      case "ArrowUp":
        next = index < 0 ? 0 : index - 1;
        break;
      case "PageDown":
        next =
          Math.max(0, index) +
          Math.floor((this.viewportHeight() - 32) / this.size());
        break;
      case "PageUp":
        next =
          Math.max(0, index) -
          Math.floor((this.viewportHeight() - 32) / this.size());
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = this.rows().length - 1;
        break;
      case "Enter":
        if (index >= 0) {
          event.preventDefault();
          this.rowActivated.emit(this.rows()[index]);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    this.select(Math.max(0, Math.min(this.rows().length - 1, next)));
  }
}
