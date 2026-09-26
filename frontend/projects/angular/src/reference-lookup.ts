import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import {
  AtlasLatestRequest,
  AtlasLookup,
  AtlasLookupColumn,
} from "@bqatlas/ui";
import type { LookupProvider } from "@bqatlas/contracts";
@Component({
  selector: "bqatlas-reference-lookup",
  imports: [AtlasLookup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<atlas-lookup
    [controlId]="controlId()"
    [ariaLabel]="label()"
    [describedBy]="describedBy()"
    [rows]="rows()"
    [columns]="columns()"
    [recordKey]="recordKey()"
    [displayWith]="displayWith()"
    [selectedText]="selectedText()"
    [value]="value()"
    (valueChange)="value.set($event)"
    (recordSelected)="recordSelected.emit($event)"
    [remote]="true"
    [disabled]="disabled()"
    [required]="required()"
    [invalid]="invalid()"
    [touched]="true"
    [loading]="loading()"
    [error]="error()"
    [page]="page()"
    [total]="total()"
    [pageSize]="pageSize"
    (queryChange)="search($event)"
    (pageChange)="load($event)"
    (retry)="load(page())"
  />`,
})
export class ReferenceLookup<T> {
  readonly provider = input.required<LookupProvider<T>>();
  readonly columns = input.required<readonly AtlasLookupColumn<T>[]>();
  readonly recordKey = input.required<(row: T) => string>();
  readonly displayWith = input.required<(row: T) => string>();
  readonly controlId = input.required<string>();
  readonly label = input("Record");
  readonly selectedText = input("");
  readonly describedBy = input<string>();
  readonly value = model<string | null>(null);
  readonly recordSelected = output<T | null>();
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly rows = signal<T[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal("");
  readonly pageSize = 20;
  private readonly request = new AtlasLatestRequest();
  private query = "";
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.cancel();
      clearTimeout(this.timer);
    });
  }
  search(query: string) {
    this.query = query;
    this.request.cancel();
    this.loading.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(0), 150);
  }
  load(page: number) {
    this.page.set(page);
    this.loading.set(true);
    this.error.set("");
    return this.request.run(
      (signal) =>
        this.provider().query(
          { page, pageSize: this.pageSize, search: this.query },
          signal,
        ),
      (result) => {
        this.rows.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      (error) => {
        this.error.set(
          error instanceof Error ? error.message : "Unable to load records.",
        );
        this.loading.set(false);
      },
    );
  }
}
