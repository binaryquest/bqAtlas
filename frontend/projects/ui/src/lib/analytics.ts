import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { AtlasButton } from "./primitives";
import { atlasSumDecimal } from "./grouping";

export interface AtlasPivotResult {
  columns: string[];
  rows: { label: string; values: string[]; total: string }[];
  totals: string[];
  grandTotal: string;
}
export function atlasPivot<T>(
  records: readonly T[],
  row: (record: T) => string,
  column: (record: T) => string,
  value: (record: T) => string,
  scale = 2,
): AtlasPivotResult {
  const columns = [...new Set(records.map(column))].sort();
  const groups = new Map<string, Map<string, string[]>>();
  for (const record of records) {
    const label = row(record),
      field = column(record);
    if (!groups.has(label)) groups.set(label, new Map());
    const cells = groups.get(label)!;
    if (!cells.has(field)) cells.set(field, []);
    cells.get(field)!.push(value(record));
  }
  const rows = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, cells]) => {
      const values = columns.map((key) =>
        atlasSumDecimal(cells.get(key) ?? [], scale),
      );
      return { label, values, total: atlasSumDecimal(values, scale) };
    });
  const totals = columns.map((_, index) =>
    atlasSumDecimal(
      rows.map((row) => row.values[index]),
      scale,
    ),
  );
  return { columns, rows, totals, grandTotal: atlasSumDecimal(totals, scale) };
}
@Component({
  selector: "atlas-pivot-table",
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result().data; as pivot) {
      <div class="atlas-table-scroll">
        <table class="atlas-table atlas-pivot-table">
          <caption>
            {{
              label()
            }}
            ·
            {{
              records().length
            }}
            supplied records
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ rowLabel() }}</th>
              @for (column of pivot.columns; track column) {
                <th scope="col">{{ column }}</th>
              }
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            @for (row of pivot.rows; track row.label) {
              <tr>
                <th scope="row">{{ row.label }}</th>
                @for (value of row.values; track $index) {
                  <td>
                    <button
                      type="button"
                      class="atlas-pivot-cell"
                      [attr.aria-label]="
                        row.label + ', ' + pivot.columns[$index] + ': ' + value
                      "
                      (click)="
                        cellSelected.emit({
                          row: row.label,
                          column: pivot.columns[$index],
                        })
                      "
                    >
                      {{ value }}
                    </button>
                  </td>
                }
                <td>{{ row.total }}</td>
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="pivot.columns.length + 2">
                  No matching records.
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              @for (value of pivot.totals; track $index) {
                <td>{{ value }}</td>
              }
              <td>{{ pivot.grandTotal }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    } @else {
      <p role="alert">{{ result().error }}</p>
    }
  `,
})
export class AtlasPivotTable<T> {
  readonly records = input.required<readonly T[]>();
  readonly row = input.required<(record: T) => string>();
  readonly column = input.required<(record: T) => string>();
  readonly measure = input.required<(record: T) => string>();
  readonly scale = input(2);
  readonly label = input("Pivot totals");
  readonly rowLabel = input("Group");
  readonly cellSelected = output<{ row: string; column: string }>();
  readonly result = computed(() => {
    try {
      if (this.records().length > 50000)
        throw new Error(
          "Limit this local pivot to 50,000 records or supply server aggregates.",
        );
      if (
        new Set(this.records().map(this.column())).size > 24 ||
        new Set(this.records().map(this.row())).size > 500
      )
        throw new Error(
          "Choose coarser dimensions: at most 24 columns and 500 row groups.",
        );
      const data = atlasPivot(
        this.records(),
        this.row(),
        this.column(),
        this.measure(),
        this.scale(),
      );
      return { data, error: "" };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to aggregate records.",
      };
    }
  });
}
export interface AtlasChartPoint {
  id: string;
  label: string;
  value: number;
}
export function atlasChartDomain(points: readonly AtlasChartPoint[]) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  let min = 0,
    max = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max: max === min ? min + 1 : max };
}
@Component({
  selector: "atlas-chart",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="atlas-chart">
      <figcaption>{{ label() }}</figcaption>
      <svg
        viewBox="0 0 640 280"
        role="group"
        [attr.aria-label]="label() + '. Select a point or use the data table.'"
      >
        @for (tick of ticks(); track $index) {
          <line
            x1="65"
            x2="620"
            [attr.y1]="y(tick)"
            [attr.y2]="y(tick)"
            class="atlas-chart-grid"
          />
          <text x="58" [attr.y]="y(tick) + 4" text-anchor="end">
            {{ tickLabel(tick) }}
          </text>
        }
        <line
          x1="65"
          x2="620"
          [attr.y1]="y(0)"
          [attr.y2]="y(0)"
          class="atlas-chart-axis"
        />
        @if (type() === "line") {
          <polyline [attr.points]="line()" class="atlas-chart-line" />
        }
        @for (point of visible(); track point.id) {
          @if (type() === "bar") {
            <rect
              role="button"
              tabindex="0"
              [attr.aria-label]="point.label + ': ' + point.value"
              [attr.aria-pressed]="selected() === point.id"
              [attr.x]="x($index) - barWidth() / 2"
              [attr.y]="y(Math.max(0, point.value))"
              [attr.width]="barWidth()"
              [attr.height]="Math.max(2, Math.abs(y(point.value) - y(0)))"
              class="atlas-chart-mark"
              (click)="choose(point)"
              (keydown.enter)="choose(point)"
              (keydown.space)="$event.preventDefault(); choose(point)"
            />
          } @else {
            <circle
              role="button"
              tabindex="0"
              [attr.aria-label]="point.label + ': ' + point.value"
              [attr.aria-pressed]="selected() === point.id"
              [attr.cx]="x($index)"
              [attr.cy]="y(point.value)"
              r="5"
              class="atlas-chart-mark"
              (click)="choose(point)"
              (keydown.enter)="choose(point)"
              (keydown.space)="$event.preventDefault(); choose(point)"
            />
          }
          <text [attr.x]="x($index)" y="259" text-anchor="middle">
            {{
              point.label.length > 10
                ? point.label.slice(0, 9) + "…"
                : point.label
            }}
          </text>
        }
      </svg>
      @if (!visible().length) {
        <p role="status">No chart data.</p>
      }
      @if (omitted()) {
        <p role="status">
          {{ omitted() }} points omitted: charts show at most 24 finite values.
          Use the complete source for analysis.
        </p>
      }
      <details>
        <summary>Chart data</summary>
        <table class="atlas-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            @for (point of visible(); track point.id) {
              <tr>
                <th scope="row">{{ point.label }}</th>
                <td>{{ point.value }}</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    </figure>
  `,
})
export class AtlasChart {
  readonly points = input<readonly AtlasChartPoint[]>([]);
  readonly type = input<"bar" | "line">("bar");
  readonly label = input("Chart");
  readonly selected = model<string | null>(null);
  readonly pointSelected = output<AtlasChartPoint>();
  readonly Math = Math;
  readonly visible = computed(() =>
    this.points()
      .filter((point) => Number.isFinite(point.value))
      .slice(0, 24),
  );
  readonly omitted = computed(
    () => this.points().length - this.visible().length,
  );
  readonly domain = computed(() => atlasChartDomain(this.visible()));
  readonly ticks = computed(() =>
    Array.from(
      { length: 5 },
      (_, index) =>
        this.domain().min * (1 - index / 4) + this.domain().max * (index / 4),
    ),
  );
  readonly line = computed(() =>
    this.visible()
      .map((point, index) => `${this.x(index)},${this.y(point.value)}`)
      .join(" "),
  );
  x(index: number) {
    return 65 + ((index + 0.5) * 555) / Math.max(1, this.visible().length);
  }
  y(value: number) {
    const { min, max } = this.domain();
    const scale = Math.max(Math.abs(min), Math.abs(max));
    return (
      230 - ((value / scale - min / scale) / (max / scale - min / scale)) * 210
    );
  }
  barWidth() {
    return Math.min(56, 380 / Math.max(1, this.visible().length));
  }
  tickLabel(value: number) {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  choose(point: AtlasChartPoint) {
    this.selected.set(point.id);
    this.pointSelected.emit(point);
  }
}

export function atlasDashboardOrder(
  ids: readonly string[],
  order: readonly string[],
): string[] {
  return [...new Set([...order.filter((id) => ids.includes(id)), ...ids])];
}
export function atlasMovePanel(
  ids: readonly string[],
  id: string,
  target: string,
): string[] {
  if (!ids.includes(id) || !ids.includes(target) || id === target)
    return [...ids];
  const next = ids.filter((value) => value !== id);
  next.splice(ids.indexOf(target), 0, id);
  return next;
}
@Directive({ selector: "ng-template[atlasDashboardPanel]" })
export class AtlasDashboardPanel {
  readonly id = input.required<string>({ alias: "atlasDashboardPanel" });
  readonly title = input.required<string>();
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
@Component({
  selector: "atlas-dashboard",
  imports: [NgTemplateOutlet, AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="atlas-muted">
      Drag a panel handle or use its Earlier/Later buttons to change the layout.
    </p>
    <div class="atlas-dashboard">
      @for (panel of ordered(); track panel.id()) {
        <section
          class="atlas-dashboard-panel"
          [attr.aria-label]="panel.title()"
          (dragover)="allowDrop($event)"
          (drop)="drop($event, panel.id())"
        >
          <header>
            <strong>{{ panel.title() }}</strong>
            <div>
              <button
                atlasButton
                type="button"
                draggable="true"
                [attr.aria-label]="'Drag ' + panel.title()"
                (dragstart)="start($event, panel.id())"
                (dragend)="dragged.set(null)"
              >
                ⠿
              </button>
              <button
                atlasButton
                type="button"
                [disabled]="$first"
                [attr.aria-label]="'Move ' + panel.title() + ' earlier'"
                (click)="move(panel.id(), -1)"
              >
                ←
              </button>
              <button
                atlasButton
                type="button"
                [disabled]="$last"
                [attr.aria-label]="'Move ' + panel.title() + ' later'"
                (click)="move(panel.id(), 1)"
              >
                →
              </button>
            </div>
          </header>
          <div class="atlas-dashboard-content">
            <ng-container [ngTemplateOutlet]="panel.template" />
          </div>
        </section>
      }
    </div>
    <p role="status" class="atlas-muted">{{ announcement() }}</p>
  `,
})
export class AtlasDashboard {
  readonly panels = contentChildren(AtlasDashboardPanel);
  readonly order = model<string[]>([]);
  readonly dragged = signal<string | null>(null);
  readonly announcement = signal("");
  readonly ordered = computed(() =>
    atlasDashboardOrder(
      this.panels().map((panel) => panel.id()),
      this.order(),
    ).map((id) => this.panels().find((panel) => panel.id() === id)!),
  );
  move(id: string, direction: number) {
    const ids = this.ordered().map((panel) => panel.id()),
      index = ids.indexOf(id),
      target = ids[index + direction];
    if (target) this.reorder(id, target);
  }
  reorder(id: string, target: string) {
    this.order.set(
      atlasMovePanel(
        this.ordered().map((panel) => panel.id()),
        id,
        target,
      ),
    );
    this.announcement.set(
      `Panel moved to position ${this.order().indexOf(id) + 1}.`,
    );
  }
  start(event: DragEvent, id: string) {
    this.dragged.set(id);
    event.dataTransfer?.setData("text/plain", id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
  allowDrop(event: DragEvent) {
    if (this.dragged()) event.preventDefault();
  }
  drop(event: DragEvent, target: string) {
    const id = this.dragged();
    if (!id) return;
    event.preventDefault();
    this.reorder(id, target);
    this.dragged.set(null);
  }
}
