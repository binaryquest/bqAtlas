import {
  ChangeDetectionStrategy,
  afterNextRender,
  ElementRef,
  Injector,
  Type,
  Component,
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { NgComponentOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  ATLAS_TASK,
  AtlasButton,
  AtlasInput,
  AtlasTable,
  AtlasTableQuery,
  AtlasColumn,
  WorkspaceService,
  WorkspaceTask,
} from "@bqatlas/ui";
import type { QueryRequest, ResourceDescriptor, ResourceProvider, FieldDescriptor } from "@bqatlas/contracts";
import { ApiError, AtlasApi, RestResourceProvider } from "./api";
import { AtlasSession } from "./session";
import { RecordDraft } from "./record-draft";
import { AtlasDecimalTextInput } from "./decimal-input";
import { validateFields, editableValues, FieldValidators } from "./field-values";
export interface FieldRendererContext {
  controlId: string;
  errorId: string;
  field: Readonly<FieldDescriptor>;
  value: unknown;
  row: Readonly<Record<string, unknown>>;
  disabled: boolean;
  errors: readonly string[];
  change: (value: unknown) => void;
}
export interface CrudFeature {
  resource: string;
  title: string;
  icon: string;
  writePermission: string;
  deletePermission: string;
  defaults: Record<string, unknown>;
  /** Optional list field order; forms continue to use the resource descriptor. */
  listFields?: readonly string[];
  fieldRenderers?: Readonly<Record<string, Type<unknown>>>;
  fieldValidators?: FieldValidators;
  /** Trusted application code selects transport; server metadata never executes code. */
  provider?: (api: AtlasApi, descriptor: ResourceDescriptor) => ResourceProvider<Record<string, unknown>, Record<string, unknown>>;
  listComponent?: Type<unknown>;
  editorComponent?: Type<unknown>;
}
export function selectListFields(descriptor: ResourceDescriptor, names?: readonly string[]): readonly FieldDescriptor[] {
  if (!names) return descriptor.fields;
  if (!names.length || new Set(names).size !== names.length) throw new Error('List fields must be nonempty and distinct.');
  return names.map(name => {
    const field = descriptor.fields.find(field => field.name === name);
    if (!field) throw new Error(`Unknown list field: ${name}`);
    return field;
  });
}
type Row = Record<string, unknown>;
export interface EditorTask {
  resource: string;
  id?: string;
  relation?: string;
  defaults?: Row;
}
@Injectable({ providedIn: "root" })
export class CrudWorkspace {
  private readonly workspace = inject(WorkspaceService);
  private readonly session = inject(AtlasSession);
  private readonly definitions = new Map<string, CrudFeature>();
  readonly revision = signal(0);
  private readonly returns = new Map<string, (id: string) => Promise<void>>();
  openRelated(resource: string, origin: string, selected: (id: string) => Promise<void>, id?: string, defaults?: Row) {
    const feature = this.feature(resource);
    this.descriptor(resource);
    if (feature.editorComponent) throw new Error("This custom editor has not registered related-record support.");
    if (!id && !this.session.has(feature.writePermission)) throw new Error("You cannot create this record.");
    const relation = crypto.randomUUID();
    this.returns.set(relation, selected);
    try {
      const task = this.workspace.open<EditorTask>({screen: "bqatlas.editor", key: relation,
        title: id ? feature.title : `New ${feature.title}`, origin, data: {resource, id, relation, defaults}});
      return {task, cancel: () => this.cancelRelated(relation)};
    } catch (error) { this.cancelRelated(relation); throw error; }
  }
  cancelRelated(id: string) { this.returns.delete(id); }
  async returnRelated(relation: string, id: string) {
    const callback = this.returns.get(relation);
    if (!callback) throw new Error("The originating field is no longer available. The record remains saved.");
    await callback(id);
    this.returns.delete(relation);
  }
  constructor() {
    this.workspace.register(
      {
        id: "bqatlas.list",
        title: "Records",
        icon: "grid",
        component: CrudList,
        instance: "keyed",
        width: 960,
        height: 610,
      },
      {
        id: "bqatlas.editor",
        title: "Record",
        icon: "edit",
        component: CrudEditor,
        instance: "keyed",
        width: 660,
        height: 500,
      },
    );
  }
  register(...features: CrudFeature[]) {
    for (const feature of features) {
      if (this.definitions.has(feature.resource))
        throw new Error(`Duplicate resource: ${feature.resource}`);
      this.definitions.set(feature.resource, feature);
      if (feature.listComponent)
        this.workspace.register({
          id: feature.resource + ".list",
          title: feature.title,
          icon: feature.icon,
          component: feature.listComponent,
          instance: "singleton",
          width: 1000,
          height: 620,
        });
      if (feature.editorComponent)
        this.workspace.register({
          id: feature.resource + ".editor",
          title: feature.title,
          icon: feature.icon,
          component: feature.editorComponent,
          instance: "keyed",
          width: 1050,
          height: 690,
        });
    }
  }
  feature(id: string) {
    const value = this.definitions.get(id);
    if (!value) throw new Error(`Unknown feature: ${id}`);
    return value;
  }
  descriptor(id: string): ResourceDescriptor {
    const value = this.session.manifest()?.resources.find((r) => r.id === id);
    if (!value || !this.session.has(value.readPermission))
      throw new Error("This resource is unavailable.");
    return value;
  }
  menus() {
    return [...this.definitions.values()].filter((f) =>
      this.session
        .manifest()
        ?.resources.some(
          (r) => r.id === f.resource && this.session.has(r.readPermission),
        ),
    );
  }
  openList(resource: string) {
    const feature = this.feature(resource);
    this.descriptor(resource);
    this.workspace.open({
      screen: feature.listComponent ? resource + ".list" : "bqatlas.list",
      key: resource,
      title: feature.title,
      data: { resource },
    });
  }
  openEditor(resource: string, id?: string, origin?: string) {
    const feature = this.feature(resource);
    this.descriptor(resource);
    if (!id && !this.session.has(feature.writePermission))
      throw new Error("You cannot create this record.");
    this.workspace.open<EditorTask>({
      screen: feature.editorComponent ? resource + ".editor" : "bqatlas.editor",
      key: `${resource}:${id ?? crypto.randomUUID()}`,
      title: id ? feature.title : `New ${feature.title}`,
      data: { resource, id },
      origin,
    });
  }
  changed() {
    this.revision.update((v) => v + 1);
  }
}
@Component({
  selector: "bqatlas-crud-list",
  imports: [AtlasButton, AtlasTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="bqatlas-view">
    <header class="bqatlas-toolbar">
      <strong>{{ descriptor.title }}</strong
      ><span class="bqatlas-spacer"></span>
      @if (session.has(feature.writePermission)) {
        <button atlasButton variant="primary" (click)="create()">New</button>
      }
      <button atlasButton (click)="reload()">Refresh</button>
    </header>
    <atlas-table
      [rows]="rows()"
      [columns]="columns"
      [keyField]="descriptor.keyField"
      [server]="true"
      [total]="total()"
      [pageSize]="25"
      [loading]="loading()"
      [error]="error()"
      [filterable]="true"
      [multiSort]="true"
      [columnManage]="true"
      [columnFilters]="true"
      (queryChange)="query($event)"
      (retry)="reload()"
      (rowActivated)="open($event)"
    />
  </section>`,
})
export class CrudList {
  readonly task = inject(ATLAS_TASK) as WorkspaceTask<{ resource: string }>;
  readonly crud = inject(CrudWorkspace);
  readonly session = inject(AtlasSession);
  readonly descriptor = this.crud.descriptor(this.task.data().resource);
  readonly feature = this.crud.feature(this.descriptor.id);
  private readonly provider = this.feature.provider?.(inject(AtlasApi), this.descriptor) ?? new RestResourceProvider<Row, Row>(
    inject(AtlasApi),
    this.descriptor.endpoint,
  );
  readonly columns: AtlasColumn<Row>[] = selectListFields(this.descriptor, this.feature.listFields).map((f) => ({
    key: f.name,
    label: f.label,
    filterable: f.type !== "boolean",
    format: (row) =>
      f.type === "boolean"
        ? row[f.name]
          ? "Yes"
          : "No"
        : String(row[f.name] ?? ""),
  }));
  readonly rows = signal<Row[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal("");
  private request: QueryRequest = { page: 0, pageSize: 25, search: "" };
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      clearTimeout(this.timer);
    });
    effect(() => {
      this.crud.revision();
      untracked(() => this.reload());
    });
  }
  query(value: AtlasTableQuery) {
    this.request = {
      page: value.page,
      pageSize: value.pageSize,
      search: value.search,
      sort: value.sort.map((s) => ({ field: s.key, direction: s.direction })),
      filters: Object.entries(value.filters)
        .filter(([, v]) => v !== "")
        .map(([field, value]) => ({ field, operator: ["string", "email"].includes(this.descriptor.fields.find(f => f.name === field)?.type ?? "") ? "contains" : "eq", value })),
    };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reload(), 180);
  }
  async reload() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.loading.set(true);
    this.error.set("");
    try {
      const result = await this.provider.query(this.request, controller.signal);
      if (!controller.signal.aborted) {
        this.rows.set(result.items);
        this.total.set(result.total);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        this.error.set(
          error instanceof Error ? error.message : "Unable to load records.",
        );
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
  create() {
    this.crud.openEditor(this.descriptor.id, undefined, this.task.id);
  }
  open(row: Row) {
    this.crud.openEditor(
      this.descriptor.id,
      String(row[this.descriptor.keyField]),
      this.task.id,
    );
  }
}
@Component({
  selector: "bqatlas-crud-editor",
  imports: [FormsModule, AtlasButton, AtlasInput, AtlasDecimalTextInput, NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(keydown.control.s)": "saveShortcut($event)",
    "(keydown.meta.s)": "saveShortcut($event)",
  },
  template: `<section class="bqatlas-view">
    <header class="bqatlas-toolbar">
      <strong>{{ descriptor.title }}</strong
      ><span class="bqatlas-spacer"></span>
      @if (canWrite()) {
        <button
          atlasButton
          variant="primary"
          [disabled]="loading() || task.saving() || !draft.dirty()"
          (click)="save()"
        >
          Save
        </button>
      }
      <button
        atlasButton
        [disabled]="loading() || task.saving()"
        (click)="reload()"
      >
        Reload
      </button>
      @if (task.data().relation) {
        <button atlasButton variant="primary" [disabled]="loading() || task.saving() || returning()"
          (click)="saveAndReturn()">{{ canWrite() ? 'Save & select' : 'Select & return' }}</button>
      }
      @if (id && canDelete() && !task.data().relation) {
        <button
          atlasButton
          variant="danger"
          [disabled]="loading() || task.saving()"
          (click)="remove()"
        >
          Delete
        </button>
      }
    </header>
    @if (task.error()) {
      <div class="atlas-alert error" role="alert">{{ task.error() }}</div>
    }
    @if (loading()) {
      <p role="status">Loading record…</p>
    }
    <form class="bqatlas-form" (ngSubmit)="save()">
      <fieldset [disabled]="loading() || task.saving() || !canWrite()">
        @for (field of descriptor.fields; track field.name) {
          <div class="bqatlas-field">
            <label [for]="task.id + '-' + field.name"
              >{{ field.label }}
              @if (field.required) {
                <span aria-hidden="true">*</span>
              }
            </label>
            @if (fieldRenderer(field.name); as renderer) {
              <ng-container *ngComponentOutlet="renderer;inputs:{context:fieldContext(field)}" />
            } @else if (field.readOnly || field.type === 'reference'  || field.type === 'dateTime') {
              <output [id]="task.id + '-' + field.name">{{ draft.value()[field.name] }}</output>
              @if (!field.readOnly) { <small>This field requires a custom editor.</small> }
            } @else if (field.type === 'enum') {
              <select [id]="task.id + '-' + field.name" [name]="field.name" [required]="field.required"
                [attr.aria-invalid]="!!errors()[field.name]" [attr.aria-describedby]="task.id + '-' + field.name + '-error'"
                [ngModel]="draft.value()[field.name]" (ngModelChange)="change(field.name, $event)">
                <option value="">Choose…</option>
                @for (option of field.options ?? []; track option) { <option [value]="option">{{ option }}</option> }
              </select>
            } @else if (field.type === 'decimal') {
              <bqatlas-decimal-input [controlId]="task.id + '-' + field.name" [name]="field.name"
                [scale]="field.scale ?? 2" [maximum]="field.maximum ?? undefined"
                [invalid]="!!errors()[field.name]" [describedBy]="task.id + '-' + field.name + '-error'"
                [required]="field.required" [ngModel]="draft.value()[field.name]"
                (ngModelChange)="change(field.name, $event)" />
            } @else if (field.type === 'integer') {
              <input atlasInput type="number" step="1" [id]="task.id + '-' + field.name"
                [attr.aria-invalid]="!!errors()[field.name]" [attr.aria-describedby]="task.id + '-' + field.name + '-error'"
                [name]="field.name" [required]="field.required"
                [ngModel]="draft.value()[field.name]" (ngModelChange)="change(field.name, $event)" />
            } @else if (field.type === "boolean") {
              <input
                type="checkbox"
                [attr.aria-invalid]="!!errors()[field.name]"
                [attr.aria-describedby]="task.id + '-' + field.name + '-error'"
                [id]="task.id + '-' + field.name"
                [name]="field.name"
                [ngModel]="draft.value()[field.name]"
                (ngModelChange)="change(field.name, $event)"
              />
            } @else {
              <input
                atlasInput
                [id]="task.id + '-' + field.name"
                [name]="field.name"
                [type]="field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'"
                [required]="field.required"
                [readOnly]="field.readOnly"
                [attr.maxlength]="field.maxLength"
                [ngModel]="draft.value()[field.name]"
                (ngModelChange)="change(field.name, $event)"
                [attr.aria-invalid]="!!errors()[field.name]"
                [attr.aria-describedby]="task.id + '-' + field.name + '-error'"
              />
            }
            <small
              [id]="task.id + '-' + field.name + '-error'"
              class="bqatlas-field-error"
              >{{ errors()[field.name]?.join(" ") }}</small
            >
          </div>
        }
      </fieldset>
      <button type="submit" hidden>Save</button>
    </form>
    <footer class="bqatlas-record-status">
      {{ draft.dirty() ? "Unsaved changes" : "Saved" }}
      @if (draft.version()) {
        · Version {{ draft.version()?.slice(0, 8) }}
      }
    </footer>
  </section>`,
})
export class CrudEditor {
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private focusError(errors: Record<string, string[]>) {
    const name = this.descriptor.fields.find(field => errors[field.name]?.length)?.name;
    if (!name) return;
    afterNextRender(() => {
      if (this.controller.signal.aborted || this.workspace.activeId() !== this.task.id) return;
      const id = this.task.id + '-' + name;
      const root = this.element.nativeElement as HTMLElement;
      const control = [...root.querySelectorAll<HTMLElement>('[id]')].find(element => element.id === id);
      control?.focus();
    }, {injector: this.injector});
  }
  readonly task = inject(ATLAS_TASK) as WorkspaceTask<EditorTask>;
  readonly crud = inject(CrudWorkspace);
  readonly session = inject(AtlasSession);
  readonly workspace = inject(WorkspaceService);
  readonly descriptor = this.crud.descriptor(this.task.data().resource);
  readonly feature = this.crud.feature(this.descriptor.id);
  readonly draft = new RecordDraft<Row>();
  readonly loading = signal(false);
  readonly errors = signal<Record<string, string[]>>({});
  readonly canWrite = computed(() =>
    this.session.has(this.feature.writePermission) && this.draft.capabilities()?.edit !== false,
  );
  private readonly provider = this.feature.provider?.(inject(AtlasApi), this.descriptor) ?? new RestResourceProvider<Row, Row>(
    inject(AtlasApi),
    this.descriptor.endpoint,
  );
  readonly canDelete = computed(() => this.session.has(this.feature.deletePermission) && this.draft.capabilities()?.delete !== false);
  private readonly controller = new AbortController();
  readonly returning = signal(false);
  id = this.task.data().id;
  async saveAndReturn() {
    if (this.returning() || this.loading() || this.task.saving()) return;
    this.returning.set(true);
    try {
      if ((!this.id || this.draft.dirty()) && !(await this.save())) return;
      if (!this.id || this.controller.signal.aborted) return;
      await this.crud.returnRelated(this.task.data().relation!, this.id);
      await this.workspace.requestClose(this.task.id);
    } catch (error) { this.task.error.set(error instanceof Error ? error.message : "Unable to return record."); }
    finally { this.returning.set(false); }
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    this.task.lifecycle.dispose = () => { this.controller.abort(); const relation = this.task.data().relation; if (relation) this.crud.cancelRelated(relation); };
    this.task.lifecycle.save = () => this.persist();
    effect(() => this.task.dirty.set(this.draft.dirty()));
    if (this.id) void this.load();
    else this.draft.initialize({...this.feature.defaults, ...this.task.data().defaults});
  }
  fieldRenderer(name: string): Type<unknown> | null {
    return this.feature.fieldRenderers && Object.hasOwn(this.feature.fieldRenderers, name) ? this.feature.fieldRenderers[name] : null;
  }
  fieldContext(field: FieldDescriptor): FieldRendererContext {
    return {
      controlId: this.task.id + '-' + field.name, errorId: this.task.id + '-' + field.name + '-error',
      field: structuredClone(field), value: structuredClone(this.draft.value()[field.name]), row: structuredClone(this.draft.value()),
      disabled: field.readOnly || !this.canWrite() || this.loading() || this.task.saving(),
      errors: [...(this.errors()[field.name] ?? [])], change: value => this.change(field.name, value),
    };
  }
  change(key: string, value: unknown) {
    const field = this.descriptor.fields.find(field => field.name === key);
    if (!field || field.readOnly || !this.canWrite() || this.loading() || this.task.saving()) return;
    this.draft.change(key, structuredClone(value));
    this.task.dirty.set(true);
  }
  async reload() {
    if (
      this.draft.dirty() &&
      !confirm("Discard your unsaved changes and reload?")
    )
      return;
    if (this.id) await this.load();
    else this.draft.initialize({...this.feature.defaults, ...this.task.data().defaults});
  }
  private async load() {
    this.loading.set(true);
    this.task.error.set("");
    try {
      const record = await this.provider.get(this.id!, this.controller.signal);
      if (!this.controller.signal.aborted) {
        this.draft.accept(record);
        this.errors.set({});
      }
    } catch (error) {
      if (!this.controller.signal.aborted)
        this.task.error.set(
          error instanceof Error ? error.message : "Unable to load record.",
        );
    } finally {
      if (!this.controller.signal.aborted) this.loading.set(false);
    }
  }
  save() {
    return this.workspace.save(this.task.id);
  }
  saveShortcut(event: Event) {
    if (this.workspace.activeId() !== this.task.id) return;
    event.preventDefault();
    if (!this.loading() && this.canWrite()) void this.save();
  }
  private async persist() {
    if (!this.canWrite() || this.loading())
      throw new Error("This record cannot be saved.");
    this.errors.set({});
    const errors = validateFields(this.descriptor.fields, this.draft.value(), this.feature.fieldValidators);
    if (Object.keys(errors).length) {
      this.errors.set(errors);
      this.focusError(errors);
      throw new Error("Correct the highlighted fields before saving.");
    }
    const value = editableValues(this.descriptor.fields, this.draft.value());
    try {
      const result = this.id
        ? await this.provider.update(
            this.id,
            value,
            this.draft.version()!,
            this.controller.signal,
          )
        : await this.provider.create(value, this.controller.signal);
      if (this.controller.signal.aborted) return;
      this.id = String(result.data[this.descriptor.keyField]);
      this.task.data.update(data => ({...data, id:this.id}));
      if (!this.task.data().relation) this.workspace.rekey(this.task.id, `${this.descriptor.id}:${this.id}`);
      this.draft.accept(result);
      this.crud.changed();
    } catch (error) {
      if (error instanceof ApiError) {
        const errors = error.problem.errors ?? {};
        this.errors.set(errors);
        this.focusError(errors);
      }
      throw error;
    }
  }
  async remove() {
    if (!this.canDelete() || this.loading() || this.task.saving() || !this.id || !this.draft.version() || !confirm("Delete this record?"))
      return;
    this.task.saving.set(true);
    this.task.error.set("");
    try {
      await this.provider.delete(
        this.id,
        this.draft.version()!,
        this.controller.signal,
      );
      this.task.saving.set(false);
      this.draft.dirty.set(false);
      this.task.dirty.set(false);
      this.crud.changed();
      await this.workspace.requestClose(this.task.id);
    } catch (error) {
      if (!this.controller.signal.aborted)
        this.task.error.set(
          error instanceof Error ? error.message : "Unable to delete.",
        );
    } finally {
      this.task.saving.set(false);
    }
  }
}
