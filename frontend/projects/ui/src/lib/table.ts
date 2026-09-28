import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  contentChildren,
  contentChild,
  effect,
  linkedSignal,
  untracked,
  inject,
  computed,
  input,
  output,
  model,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { AtlasIcon, AtlasInput } from "./primitives";
import { filterCollection, pageCollection } from "./collection";
import {
  AtlasSort,
  AtlasTableQuery,
  matchesColumnFilters,
  sortByColumns,
} from "./table-query";
import {
  AtlasSummary,
  AtlasServerSummary,
  atlasHeaderBands,
  atlasGroupRows,
  atlasSummaryQueryKey,
} from "./grouping";
export interface AtlasColumn<T> {
  group?: string;
  width?: number;
  filterable?: boolean;
  key: keyof T & string;
  label: string;
  format?: (row: T) => string;
  sortValue?: (row: T) => string | number;
  badge?: boolean;
  tone?: (row: T) => "neutral" | "success" | "warning" | "info" | "danger";
  align?: "left" | "right";
  sortable?: boolean;
}
export interface AtlasCellContext<T> {
  $implicit: T;
  value: unknown;
}
@Directive({ selector: "ng-template[atlasCell]" })
export class AtlasCell<T> {
  key = input.required<string>({ alias: "atlasCell" });
  /** Supplies the row type to Angular's template checker. */
  rows = input.required<readonly T[]>({ alias: "atlasCellOf" });
  template = inject<TemplateRef<AtlasCellContext<T>>>(TemplateRef);
  static ngTemplateContextGuard<T>(
    _directive: AtlasCell<T>,
    context: unknown,
  ): context is AtlasCellContext<T> {
    return true;
  }
}
@Directive({ selector: "ng-template[atlasRowDetail]" })
export class AtlasRowDetail<T> {
  rows = input.required<readonly T[]>({ alias: "atlasRowDetailOf" });
  template = inject<TemplateRef<{ $implicit: T }>>(TemplateRef);
  static ngTemplateContextGuard<T>(
    _directive: AtlasRowDetail<T>,
    context: unknown,
  ): context is { $implicit: T } {
    return true;
  }
}
@Component({
  selector: "atlas-table",
  imports: [AtlasIcon, AtlasInput, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="atlas-data-table">
    @if (filterable() || columnToggle() || selectable()) {
      <div class="atlas-collection-toolbar">
        @if (filterable()) {
          <div class="atlas-collection-search">
            <atlas-icon name="search" /><input
              atlasInput
              [attr.aria-label]="'Search ' + label()"
              placeholder="Search all columns…"
              [value]="query()"
              (input)="search($any($event.target).value)"
            />
          </div>
        }
        <div class="atlas-collection-actions">
          @if (multiSort()) {
            <label class="atlas-sort-mode"
              ><input
                type="checkbox"
                [checked]="addSort()"
                (change)="addSort.set($any($event.target).checked)"
              />Add sort levels</label
            >
          }
          @if (sorts().length) {
            <button
              type="button"
              class="atlas-control-action"
              (click)="clearSort()"
            >
              Clear sort
            </button>
          }
          @if (selectedKeys().length) {
            <span class="atlas-selection-count"
              >{{ selectedKeys().length }} selected</span
            ><button
              type="button"
              class="atlas-control-action"
              aria-label="Clear row selection"
              (click)="selectedKeys.set([])"
            >
              <atlas-icon name="close" />
            </button>
          }
          @if (columnToggle()) {
            <details class="atlas-column-picker">
              <summary><atlas-icon name="settings" />Columns</summary>
              <fieldset>
                <legend class="atlas-sr-only">Visible columns</legend>
                @for (column of orderedColumns(); track column.key) {
                  <label
                    ><input
                      type="checkbox"
                      [checked]="!hiddenColumns().includes(column.key)"
                      [disabled]="
                        visibleColumns().length === 1 &&
                        !hiddenColumns().includes(column.key)
                      "
                      (change)="toggleColumn(column.key)"
                    />{{ column.label }}</label
                  >
                  @if (columnManage()) {
                    <div class="atlas-column-settings">
                      <button
                        type="button"
                        [attr.aria-label]="'Move ' + column.label + ' left'"
                        [disabled]="$first"
                        (click)="moveColumn(column.key, -1)"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        [attr.aria-label]="'Move ' + column.label + ' right'"
                        [disabled]="$last"
                        (click)="moveColumn(column.key, 1)"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        [attr.aria-label]="'Pin ' + column.label"
                        [attr.aria-pressed]="pinned().includes(column.key)"
                        (click)="pin(column.key)"
                      >
                        {{ pinned().includes(column.key) ? "Unpin" : "Pin" }}
                      </button>
                      <input
                        type="number"
                        min="100"
                        max="600"
                        step="20"
                        [attr.aria-label]="column.label + ' width'"
                        [value]="width(column)"
                        (change)="
                          setWidth(
                            column.key,
                            $any($event.target).valueAsNumber
                          )
                        "
                      />
                    </div>
                  }
                }
              </fieldset>
            </details>
          }
        </div>
      </div>
    }
    <div class="atlas-table-scroll" [attr.aria-busy]="loading()">
      <table
        class="atlas-table"
        [class.atlas-managed-table]="columnManage()"
        [style.width.px]="columnManage() ? tableWidth() : null"
        [attr.aria-label]="label()"
      >
        @if (columnManage()) {
          <colgroup>
            @if (selectable()) {
              <col style="width:44px" />
            }
            @for (column of visibleColumns(); track column.key) {
              <col [style.width.px]="width(column)" />
            }
            <col style="width:90px" />
          </colgroup>
        }
        <thead>
          @if (hasHeaderGroups()) {
            <tr class="atlas-header-bands">
              @if (selectable()) {
                <th></th>
              }
              @for (band of headerBands(); track $index) {
                <th scope="colgroup" [attr.colspan]="band.span">
                  {{ band.label }}
                </th>
              }
              <th></th>
            </tr>
          }
          <tr>
            @if (selectable()) {
              <th class="atlas-checkbox-cell">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  [checked]="allPageSelected()"
                  [indeterminate]="somePageSelected() && !allPageSelected()"
                  [disabled]="!paged().length || loading() || !!error()"
                  (change)="togglePage()"
                />
              </th>
            }
            @for (column of visibleColumns(); track column.key) {
              <th
                [style.text-align]="column.align || 'left'"
                [style.min-width.px]="columnManage() ? width(column) : null"
                [style.width.px]="columnManage() ? width(column) : null"
                [class.atlas-pinned]="pinned().includes(column.key)"
                [style.left.px]="pinOffset(column.key)"
                [attr.aria-sort]="sortDirection(column.key)"
              >
                <button
                  type="button"
                  [disabled]="column.sortable === false"
                  (click)="sort(column.key, $event.shiftKey)"
                >
                  {{ column.label }}
                  @if (sortIndex(column.key) >= 0) {
                    <span
                      >{{
                        sorts()[sortIndex(column.key)].direction === "desc"
                          ? "↓"
                          : "↑"
                      }}
                      {{ sortIndex(column.key) + 1 }}</span
                    >
                  }
                </button>
                @if (columnManage()) {
                  <span
                    class="atlas-column-resizer"
                    aria-hidden="true"
                    (pointerdown)="resizeStart($event, column)"
                    (pointermove)="resizeMove($event)"
                    (pointerup)="resizeEnd($event)"
                    (pointercancel)="resizeEnd($event)"
                  ></span>
                }
              </th>
            }
            <th><span class="atlas-sr-only">Open record</span></th>
          </tr>
          @if (columnFilters()) {
            <tr>
              @if (selectable()) {
                <th></th>
              }
              @for (column of visibleColumns(); track column.key) {
                <th
                  [class.atlas-pinned]="pinned().includes(column.key)"
                  [style.left.px]="pinOffset(column.key)"
                >
                  @if (column.filterable !== false) {
                    <input
                      atlasInput
                      class="atlas-column-filter"
                      [attr.aria-label]="'Filter ' + column.label"
                      placeholder="Contains…"
                      [value]="filters()[column.key] || ''"
                      (input)="
                        filterColumn(column.key, $any($event.target).value)
                      "
                    />
                  }
                </th>
              }
              <th></th>
            </tr>
          }
        </thead>
        <tbody>
          @if (error() && !loading()) {
            <tr>
              <td
                [attr.colspan]="
                  visibleColumns().length + (selectable() ? 2 : 1)
                "
                class="atlas-table-empty"
              >
                <p role="alert">{{ error() }}</p>
                <button type="button" (click)="retry.emit()">Retry</button>
              </td>
            </tr>
          } @else if (loading()) {
            <tr>
              <td
                [attr.colspan]="
                  visibleColumns().length + (selectable() ? 2 : 1)
                "
                class="atlas-table-empty"
              >
                <span role="status">Loading records…</span>
              </td>
            </tr>
          } @else {
            @for (group of pageGroups(); track group.key) {
              @if (groupBy()) {
                <tr class="atlas-group-heading">
                  <th
                    [attr.colspan]="
                      visibleColumns().length + (selectable() ? 2 : 1)
                    "
                  >
                    <button
                      type="button"
                      [attr.aria-expanded]="
                        !collapsedGroups().includes(group.key)
                      "
                      (click)="toggleGroup(group.key)"
                    >
                      <span aria-hidden="true">{{
                        collapsedGroups().includes(group.key) ? "▸" : "▾"
                      }}</span>
                      {{ group.key || "Unassigned" }}
                      <span class="atlas-muted"
                        >· {{ group.rows.length }} on this page</span
                      >
                    </button>
                  </th>
                </tr>
              }
              @if (!groupBy() || !collapsedGroups().includes(group.key)) {
                @for (row of group.rows; track rowKey(row)) {
                  <tr
                    [class.selected]="
                      selectedKeys().includes(rowKey(row)) ||
                      selected() === rowKey(row)
                    "
                  >
                    @if (selectable()) {
                      <td class="atlas-checkbox-cell">
                        <input
                          type="checkbox"
                          [attr.aria-label]="'Select ' + rowKey(row)"
                          [checked]="selectedKeys().includes(rowKey(row))"
                          (change)="toggleRow(row)"
                        />
                      </td>
                    }
                    @for (column of visibleColumns(); track column.key) {
                      <td
                        [style.text-align]="column.align || 'left'"
                        [class.atlas-pinned]="pinned().includes(column.key)"
                        [style.left.px]="pinOffset(column.key)"
                      >
                        @if (templates().get(column.key); as template) {
                          <ng-container
                            [ngTemplateOutlet]="template"
                            [ngTemplateOutletContext]="{
                              $implicit: row,
                              value: row[column.key],
                            }"
                          />
                        } @else if (column.badge) {
                          <span
                            class="atlas-badge"
                            [attr.data-tone]="
                              column.tone ? column.tone(row) : 'neutral'
                            "
                            >{{ value(row, column) }}</span
                          >
                        } @else {
                          {{ value(row, column) }}
                        }
                      </td>
                    }
                    <td>
                      @if (detail(); as detailTemplate) {
                        <button
                          type="button"
                          class="atlas-row-open"
                          [attr.aria-label]="'Details ' + rowKey(row)"
                          [attr.aria-expanded]="
                            expanded().includes(rowKey(row))
                          "
                          (click)="toggleDetail(row)"
                        >
                          {{ expanded().includes(rowKey(row)) ? "−" : "+" }}
                        </button>
                      }
                      <button
                        type="button"
                        class="atlas-row-open"
                        [attr.aria-label]="'Open ' + rowKey(row)"
                        (click)="
                          selected.set(rowKey(row)); rowActivated.emit(row)
                        "
                      >
                        <atlas-icon name="arrow" />
                      </button>
                    </td>
                  </tr>
                  @if (
                    expanded().includes(rowKey(row)) && detail();
                    as detailTemplate
                  ) {
                    <tr>
                      <td
                        class="atlas-row-detail"
                        [attr.colspan]="
                          visibleColumns().length + (selectable() ? 2 : 1)
                        "
                      >
                        <ng-container
                          [ngTemplateOutlet]="detailTemplate.template"
                          [ngTemplateOutletContext]="{ $implicit: row }"
                        />
                      </td>
                    </tr>
                  }
                }
              }
              @if (groupBy() && summaries().length) {
                <tr class="atlas-summary-row">
                  <td
                    [attr.colspan]="
                      visibleColumns().length + (selectable() ? 2 : 1)
                    "
                  >
                    <div class="atlas-summary-values">
                      <strong
                        >{{ group.key || "Unassigned" }} · page subtotal</strong
                      >
                      @for (summary of summaries(); track summary.key) {
                        <span
                          >{{ summary.label }}
                          <b>{{ summary.aggregate(group.rows) }}</b></span
                        >
                      }
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr>
                <td
                  [attr.colspan]="
                    visibleColumns().length + (selectable() ? 2 : 1)
                  "
                  class="atlas-table-empty"
                >
                  No records match your filters.
                </td>
              </tr>
            }
          }
        </tbody>
        @if (summaries().length && !loading() && !error()) {
          <tfoot>
            <tr class="atlas-summary-row">
              <td
                [attr.colspan]="
                  visibleColumns().length + (selectable() ? 2 : 1)
                "
              >
                <div class="atlas-summary-values">
                  <strong>Page total · {{ paged().length }} records</strong>
                  @for (summary of summaries(); track summary.key) {
                    <span
                      >{{ summary.label }}
                      <b>{{ summary.aggregate(paged()) }}</b></span
                    >
                  }
                </div>
                <div class="atlas-summary-values">
                  <strong>{{
                    server()
                      ? "Whole query total · server"
                      : "Filtered total · all matching records"
                  }}</strong>
                  @if (!server()) {
                    @for (summary of summaries(); track summary.key) {
                      <span
                        >{{ summary.label }}
                        <b>{{ summary.aggregate(filtered()) }}</b></span
                      >
                    }
                  } @else if (acceptedServerSummary(); as remote) {
                    @for (summary of summaries(); track summary.key) {
                      <span
                        >{{ summary.label }}
                        <b>{{
                          remote.values[summary.key] ?? "Unavailable"
                        }}</b></span
                      >
                    }
                  } @else {
                    <span>Not supplied for this request</span>
                  }
                </div>
              </td>
            </tr>
          </tfoot>
        }
      </table>
    </div>
    <footer class="atlas-table-footer">
      <span
        >{{ totalRecords() }}
        {{ totalRecords() === 1 ? "record" : "records" }}
        <span class="atlas-muted"
          >· Page {{ safePage() + 1 }} of {{ pageCount() }}</span
        ></span
      >
      <div>
        <button
          class="atlas-window-control"
          aria-label="Previous page"
          [disabled]="loading() || safePage() === 0"
          (click)="page.set(safePage() - 1)"
        >
          <atlas-icon name="back" /></button
        ><button
          class="atlas-window-control"
          aria-label="Next page"
          [disabled]="loading() || safePage() + 1 >= pageCount()"
          (click)="page.set(safePage() + 1)"
        >
          <atlas-icon name="arrow" />
        </button>
      </div>
    </footer>
  </div>`,
})
export class AtlasTable<T extends object> {
  readonly groupBy = input<(keyof T & string) | null>(null);
  readonly summaries = input<readonly AtlasSummary<T>[]>([]);
  readonly serverSummary = input<AtlasServerSummary | null>(null);
  readonly collapsedGroups = model<string[]>([]);
  readonly hasHeaderGroups = computed(() =>
    this.visibleColumns().some((column) => !!column.group),
  );
  readonly headerBands = computed(() =>
    atlasHeaderBands(this.visibleColumns()),
  );
  readonly pageGroups = computed(() => {
    const key = this.groupBy();
    return key
      ? atlasGroupRows(this.paged(), (row) => String(row[key] ?? ""))
      : this.paged().length
        ? [{ key: "", rows: this.paged() }]
        : [];
  });
  readonly acceptedServerSummary = computed(() => {
    const summary = this.serverSummary();
    return summary?.scope === "query" &&
      summary.queryKey === atlasSummaryQueryKey(this.request())
      ? summary
      : null;
  });
  toggleGroup(key: string) {
    this.collapsedGroups.update((keys) =>
      keys.includes(key)
        ? keys.filter((value) => value !== key)
        : [...keys, key],
    );
  }
  rows = input.required<T[]>();
  columns = input.required<AtlasColumn<T>[]>();
  keyField = input.required<keyof T>();
  pageSize = input(6);
  rowActivated = output<T>();
  private cells = contentChildren(AtlasCell);
  readonly templates = computed(
    () => new Map(this.cells().map((cell) => [cell.key(), cell.template])),
  );
  readonly sorts = signal<AtlasSort[]>([]);
  readonly addSort = signal(false);
  readonly page = linkedSignal({
    source: () => this.pageSize(),
    computation: () => 0,
  });
  readonly columnFilters = input(false);
  readonly multiSort = input(false);
  readonly columnManage = input(false);
  readonly server = input(false);
  readonly total = input(0);
  readonly error = input("");
  readonly retry = output<void>();
  readonly queryChange = output<AtlasTableQuery>();
  readonly filters = signal<Record<string, string>>({});
  readonly order = signal<string[]>([]);
  readonly widths = signal<Record<string, number>>({});
  readonly pinned = signal<string[]>([]);
  readonly expanded = signal<string[]>([]);
  readonly detail = contentChild(AtlasRowDetail);
  readonly orderedColumns = computed(() => {
    const keys = this.order();
    return [...this.columns()].sort((a, b) => {
      const index = (key: string) =>
        keys.includes(key)
          ? keys.indexOf(key)
          : keys.length + this.columns().findIndex((c) => c.key === key);
      return index(a.key) - index(b.key);
    });
  });
  readonly request = computed<AtlasTableQuery>(() => ({
    page: this.page(),
    pageSize: Math.max(1, Math.floor(this.pageSize()) || 6),
    search: this.query(),
    filters: this.filters(),
    sort: this.sorts(),
  }));
  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => this.queryChange.emit(request));
    });
    effect(() => {
      if (this.server() && !this.loading() && !this.error()) {
        const last = Math.max(
          0,
          Math.ceil(this.total() / this.request().pageSize) - 1,
        );
        if (this.page() > last) this.page.set(last);
      }
    });
  }
  readonly tableWidth = computed(() =>
    this.visibleColumns().reduce(
      (n, c) => n + this.width(c),
      this.selectable() ? 134 : 90,
    ),
  );
  selected = signal("");
  readonly label = input("Records");
  readonly filterable = input(false);
  readonly selectable = input(false);
  readonly columnToggle = input(false);
  readonly loading = input(false);
  readonly selectedKeys = model<string[]>([]);
  readonly query = signal("");
  readonly hiddenColumns = signal<string[]>([]);
  readonly visibleColumns = computed(() =>
    [
      ...this.orderedColumns().filter((c) => this.pinned().includes(c.key)),
      ...this.orderedColumns().filter((c) => !this.pinned().includes(c.key)),
    ].filter((column) => !this.hiddenColumns().includes(column.key)),
  );
  readonly filtered = computed(() =>
    filterCollection(
      this.rows().filter((row) =>
        matchesColumnFilters(row, this.filters(), (r, key) => {
          const c = this.columns().find((c) => c.key === key);
          return c ? this.value(r, c) : "";
        }),
      ),
      this.query(),
      (row) =>
        this.columns()
          .map((column) => this.value(row, column))
          .join(" "),
    ),
  );
  readonly sorted = computed(() =>
    sortByColumns(this.filtered(), this.sorts(), (row, key) => {
      const column = this.columns().find((c) => c.key === key);
      return column?.sortValue ? column.sortValue(row) : row[key as keyof T];
    }),
  );
  readonly totalRecords = computed(() =>
    this.server() ? this.total() : this.filtered().length,
  );
  readonly pagination = computed(() =>
    pageCollection(this.sorted(), this.page(), this.pageSize()),
  );
  readonly pageCount = computed(() =>
    this.server()
      ? Math.max(1, Math.ceil(this.total() / this.request().pageSize))
      : this.pagination().pages,
  );
  readonly safePage = computed(() =>
    this.server() ? this.page() : this.pagination().page,
  );
  readonly paged = computed(() =>
    this.server() ? this.rows() : this.pagination().items,
  );
  readonly allPageSelected = computed(
    () =>
      this.paged().length > 0 &&
      this.paged().every((row) =>
        this.selectedKeys().includes(this.rowKey(row)),
      ),
  );
  readonly somePageSelected = computed(() =>
    this.paged().some((row) => this.selectedKeys().includes(this.rowKey(row))),
  );
  search(query: string) {
    this.query.set(query);
    this.page.set(0);
  }
  toggleColumn(key: string) {
    this.hiddenColumns.update((keys) =>
      keys.includes(key)
        ? keys.filter((value) => value !== key)
        : this.visibleColumns().length > 1
          ? [...keys, key]
          : keys,
    );
  }
  toggleRow(row: T) {
    const key = this.rowKey(row);
    this.selectedKeys.update((keys) =>
      keys.includes(key)
        ? keys.filter((value) => value !== key)
        : [...keys, key],
    );
  }
  togglePage() {
    const pageKeys = this.paged().map((row) => this.rowKey(row));
    const all = this.allPageSelected();
    this.selectedKeys.update((keys) =>
      all
        ? keys.filter((key) => !pageKeys.includes(key))
        : [...new Set([...keys, ...pageKeys])],
    );
  }
  sort(key: keyof T & string, append = false) {
    const old = this.sorts().find((s) => s.key === key);
    const next: AtlasSort = {
      key,
      direction: old?.direction === "asc" ? "desc" : "asc",
    };
    this.sorts.set(
      this.multiSort() && (append || this.addSort())
        ? old
          ? this.sorts().map((s) => (s.key === key ? next : s))
          : [...this.sorts(), next]
        : [next],
    );
    this.page.set(0);
  }
  clearSort() {
    this.sorts.set([]);
    this.page.set(0);
  }
  sortIndex(key: string) {
    return this.sorts().findIndex((s) => s.key === key);
  }
  sortDirection(key: string) {
    const index = this.sortIndex(key);
    return index < 0
      ? "none"
      : this.sorts().length > 1
        ? "other"
        : this.sorts()[index].direction === "asc"
          ? "ascending"
          : "descending";
  }
  filterColumn(key: string, value: string) {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.page.set(0);
  }
  width(column: AtlasColumn<T>) {
    return this.widths()[column.key] ?? column.width ?? 180;
  }
  setWidth(key: string, value: number) {
    if (Number.isFinite(value))
      this.widths.update((w) => ({
        ...w,
        [key]: Math.max(100, Math.min(600, value)),
      }));
  }
  moveColumn(key: string, delta: number) {
    const keys = this.orderedColumns().map((c) => c.key);
    const from = keys.indexOf(key as keyof T & string),
      to = from + delta;
    if (to < 0 || to >= keys.length) return;
    [keys[from], keys[to]] = [keys[to], keys[from]];
    this.order.set(keys);
  }
  pin(key: string) {
    this.pinned.update((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  }
  pinOffset(key: string) {
    if (!this.pinned().includes(key)) return null;
    const columns = this.visibleColumns();
    return columns
      .slice(
        0,
        columns.findIndex((c) => c.key === key),
      )
      .filter((c) => this.pinned().includes(c.key))
      .reduce((n, c) => n + this.width(c), 0);
  }
  toggleDetail(row: T) {
    const key = this.rowKey(row);
    this.expanded.update((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  }
  private resizing?: { key: string; x: number; width: number };
  resizeStart(event: PointerEvent, column: AtlasColumn<T>) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resizing = {
      key: column.key,
      x: event.clientX,
      width: this.width(column),
    };
  }
  resizeMove(event: PointerEvent) {
    if (this.resizing)
      this.setWidth(
        this.resizing.key,
        this.resizing.width + event.clientX - this.resizing.x,
      );
  }
  resizeEnd(event: PointerEvent) {
    this.resizing = undefined;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
  }
  rowKey(row: T) {
    return String(row[this.keyField()]);
  }
  value(row: T, column: AtlasColumn<T>) {
    return column.format ? column.format(row) : String(row[column.key] ?? "");
  }
}
