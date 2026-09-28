import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal,
  computed,
  effect,
  ElementRef,
} from "@angular/core";
import {
  AtlasLatestRequest,
  AtlasLookup,
  AtlasLookupColumn,
  AtlasDialog,
  AtlasInput,
  AtlasButton,
  ATLAS_TASK,
  WorkspaceService,
} from "@bqatlas/ui";
import { CrudWorkspace } from "./crud";
import { AtlasSession } from "./session";
import type { LookupProvider } from "@bqatlas/contracts";
@Component({
  selector: "bqatlas-reference-lookup",
  imports: [AtlasLookup, AtlasDialog, AtlasInput, AtlasButton],
  styles: [
    `
      .reference-shell {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .reference-shell atlas-lookup {
        flex: 1;
        min-width: 0;
      }
      .reference-picker {
        width: 100%;
        border-collapse: collapse;
        margin-block: 12px;
      }
      .reference-picker th,
      .reference-picker td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--atlas-border, #ddd);
      }
      .reference-pages {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .reference-error {
        color: var(--atlas-danger, #b42318);
        margin: 6px 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="reference-shell">
      <atlas-lookup
        [controlId]="controlId()"
        [ariaLabel]="label()"
        [describedBy]="describedBy()"
        [rows]="rows()"
        [columns]="columns()"
        [recordKey]="recordKey()"
        [displayWith]="displayWith()"
        [selectedText]="resolvedCaption() || selectedText()"
        [readonly]="readonly()"
        [actions]="actions()"
        (action)="runAction($event)"
        [value]="value()"
        (recordSelected)="select($event)"
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
      />
      @if (canOpen() && value()) {
        <button
          atlasButton
          type="button"
          [disabled]="disabled()"
          [attr.aria-label]="'Open ' + label()"
          (click)="openRelated(false)"
        >
          ↗
        </button>
      }
    </div>
    @if (relationError()) {
      <p class="reference-error" role="alert">{{ relationError() }}</p>
    }
    <atlas-dialog [(open)]="pickerOpen" [title]="'Select ' + label()">
      <input
        atlasInput
        [placeholder]="'Search ' + label() + '…'"
        (keydown.enter)="$event.preventDefault(); $event.stopPropagation()"
        [attr.aria-label]="'Search all ' + label()"
        [value]="query"
        (input)="search($any($event.target).value)"
      />
      @if (loading()) {
        <p role="status">Loading records…</p>
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
        <button atlasButton type="button" (click)="load(page())">Retry</button>
      } @else {
        <table class="reference-picker">
          <thead>
            <tr>
              @for (column of columns(); track column.key) {
                <th>{{ column.label }}</th>
              }
              <th>Select</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track recordKey()(row)) {
              <tr>
                @for (column of columns(); track column.key) {
                  <td>{{ cell(row, column.key) }}</td>
                }
                <td>
                  <button
                    atlasButton
                    type="button"
                    (click)="select(row); pickerOpen.set(false)"
                    [attr.aria-label]="'Select ' + displayWith()(row)"
                  >
                    Select
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="columns().length + 1">
                  No matching records.
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      <div class="reference-pages">
        <button
          atlasButton
          type="button"
          [disabled]="loading() || page() === 0"
          (click)="load(page() - 1)"
        >
          Previous
        </button>
        <span>{{ total() }} matches · Page {{ page() + 1 }}</span>
        <button
          atlasButton
          type="button"
          [disabled]="loading() || (page() + 1) * pageSize >= total()"
          (click)="load(page() + 1)"
        >
          Next
        </button>
      </div>
      <div atlasDialogActions>
        @if (canCreate()) {
          <button atlasButton type="button" (click)="openRelated(true)">
            Create {{ label() }}…
          </button>
        }
        <button atlasButton type="button" (click)="pickerOpen.set(false)">
          Cancel
        </button>
      </div>
    </atlas-dialog>`,
})
export class ReferenceLookup<T> {
  private readonly crud = inject(CrudWorkspace);
  private readonly session = inject(AtlasSession);
  private readonly workspace = inject(WorkspaceService);
  private readonly parent = inject(ATLAS_TASK, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly resource = input<string>();
  readonly nameField = input("name");
  readonly readonly = input(false);
  /** Change when parent eligibility context changes; prevents late child selection. */
  readonly contextKey = input("");
  readonly pickerOpen = signal(false);
  readonly relationError = signal("");
  readonly resolvedCaption = signal("");
  private revision = 0;
  private alive = true;
  private readonly children = new Set<() => void>();
  private readonly controller = new AbortController();
  readonly canOpen = computed(() => {
    const resource = this.resource();
    const descriptor = this.session
      .manifest()
      ?.resources.find((r) => r.id === resource);
    return (
      !!this.parent &&
      !!descriptor &&
      this.session.has(descriptor.readPermission)
    );
  });
  readonly canCreate = computed(
    () =>
      this.canOpen() &&
      !this.disabled() &&
      !this.readonly() &&
      this.session.has(this.crud.feature(this.resource()!).writePermission),
  );
  readonly actions = computed(() =>
    this.disabled() || this.readonly()
      ? []
      : [
          { id: "search", label: "Search more…" },
          ...(this.canCreate()
            ? [{ id: "create", label: `Create ${this.label()}…` }]
            : []),
        ],
  );
  cell(row: T, key: keyof T) {
    return String(row[key] ?? "");
  }
  select(row: T | null) {
    if (this.disabled() || this.readonly()) return;
    this.revision++;
    this.resolvedCaption.set("");
    this.value.set(row ? this.recordKey()(row) : null);
    this.recordSelected.emit(row);
  }
  runAction(action: { id: string; query: string }) {
    this.query = action.query;
    if (action.id === "create") this.openRelated(true);
    else if (!this.disabled() && !this.readonly()) {
      this.pickerOpen.set(true);
      clearTimeout(this.timer);
      void this.load(0);
    }
  }
  openRelated(create: boolean) {
    if (!this.canOpen() || this.disabled() || (create && !this.canCreate()))
      return;
    const provider = this.provider();
    if (!provider.resolve) {
      this.relationError.set("This lookup does not support record resolution.");
      return;
    }
    this.pickerOpen.set(false);
    this.relationError.set("");
    const initial = this.value(),
      revision = this.revision,
      context = this.contextKey(),
      session = this.session.info();
    let childId: string | undefined;
    const valid = () =>
      this.alive &&
      this.revision === revision &&
      this.value() === initial &&
      this.contextKey() === context &&
      this.session.info() === session &&
      this.workspace.tasks().some((t) => t.id === this.parent!.id) &&
      this.workspace.tasks().some((t) => t.id === childId);
    try {
      const handle = this.crud.openRelated(
        this.resource()!,
        this.parent!.id,
        async (id) => {
          if (!valid())
            throw new Error(
              "The originating field changed. The record remains saved; select it again from the lookup.",
            );
          const row = await provider.resolve!(id, this.controller.signal);
          if (!valid())
            throw new Error(
              "The originating field is no longer available. The record remains saved.",
            );
          if (!row)
            throw new Error(
              "The record was saved but is unavailable for this lookup.",
            );
          this.request.cancel();
          clearTimeout(this.timer);
          this.loading.set(false);
          this.rows.update((rows) =>
            rows.map((existing) =>
              this.recordKey()(existing) === id ? row : existing,
            ),
          );
          if (create || id !== initial) {
            if (this.disabled() || this.readonly())
              throw new Error(
                "The originating field can no longer be changed.",
              );
            this.select(row);
          } else this.resolvedCaption.set(this.displayWith()(row));
          this.children.delete(handle.cancel);
          setTimeout(() => {
            if (this.alive)
              this.host.nativeElement
                .querySelector<HTMLElement>('[role="combobox"]')
                ?.focus();
          });
        },
        create ? undefined : (initial ?? undefined),
        create ? { [this.nameField()]: this.query.trim() } : undefined,
      );
      childId = handle.task.id;
      this.children.add(handle.cancel);
    } catch (error) {
      this.relationError.set(
        error instanceof Error ? error.message : "Unable to open record.",
      );
    }
  }
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
  query = "";
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    effect(() => {
      this.value();
      this.contextKey();
      this.provider();
      this.resource();
      this.revision++;
      this.resolvedCaption.set("");
    });
    effect(() => {
      this.provider();
      this.contextKey();
      this.request.cancel();
      clearTimeout(this.timer);
      this.rows.set([]);
      this.total.set(0);
      this.pickerOpen.set(false);
    });
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.controller.abort();
      for (const cancel of this.children) cancel();
      this.children.clear();
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
