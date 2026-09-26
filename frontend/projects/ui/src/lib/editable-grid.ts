import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { AtlasButton, AtlasInput } from "./primitives";
import {
  AtlasEditColumn,
  replaceEditedRow,
  validateEditRow,
} from "./editing-model";
let gridSequence = 0;
@Component({
  selector: "atlas-editable-grid",
  imports: [AtlasButton, AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="atlas-edit-grid-scroll">
      <table
        class="atlas-table atlas-edit-grid"
        [attr.aria-label]="label()"
        [attr.aria-busy]="disabled()"
      >
        <thead>
          <tr>
            @for (column of columns(); track column.key) {
              <th scope="col">{{ column.label }}</th>
            }
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row[keyField()]) {
            <tr [class.selected]="isEditing(row)">
              @for (column of columns(); track column.key) {
                <td [attr.data-label]="column.label">
                  @if (isEditing(row) && !column.readonly) {
                    @if (column.type === "select") {
                      <select
                        atlasInput
                        [attr.aria-label]="
                          column.label + ' for ' + row[keyField()]
                        "
                        [value]="draft()![column.key] ?? ''"
                        [disabled]="disabled()"
                        [attr.aria-invalid]="!!errors()[column.key]"
                        [attr.aria-describedby]="
                          errors()[column.key] ? errorId(column.key) : null
                        "
                        (change)="edit(column, $any($event.target).value)"
                        (keydown)="key($event)"
                      >
                        <option value="">Choose…</option>
                        @for (
                          option of column.options || [];
                          track option.value
                        ) {
                          <option
                            [value]="option.value"
                            [disabled]="option.disabled"
                          >
                            {{ option.label }}
                          </option>
                        }
                      </select>
                    } @else {
                      <input
                        atlasInput
                        [type]="column.type === 'number' ? 'number' : 'text'"
                        [attr.aria-label]="
                          column.label + ' for ' + row[keyField()]
                        "
                        [value]="draft()![column.key] ?? ''"
                        [disabled]="disabled()"
                        [min]="column.min ?? null"
                        [max]="column.max ?? null"
                        [step]="column.step ?? 'any'"
                        [attr.aria-invalid]="!!errors()[column.key]"
                        [attr.aria-describedby]="
                          errors()[column.key] ? errorId(column.key) : null
                        "
                        (input)="edit(column, $any($event.target).value)"
                        (keydown)="key($event)"
                      />
                    }
                    @if (errors()[column.key]; as error) {
                      <small
                        class="atlas-edit-error"
                        [id]="errorId(column.key)"
                        >{{ error }}</small
                      >
                    }
                  } @else {
                    {{ display(isEditing(row) ? draft()! : row, column) }}
                  }
                </td>
              }
              <td class="atlas-edit-actions">
                @if (isEditing(row)) {
                  <button
                    atlasButton
                    type="button"
                    [disabled]="disabled()"
                    (click)="apply()"
                  >
                    Apply row</button
                  ><button
                    atlasButton
                    type="button"
                    [disabled]="disabled()"
                    (click)="cancel()"
                  >
                    Cancel row
                  </button>
                } @else {
                  <button
                    atlasButton
                    type="button"
                    [attr.aria-label]="'Edit ' + row[keyField()]"
                    [attr.data-edit-key]="row[keyField()]"
                    [disabled]="disabled() || !!draft()"
                    (click)="begin(row, $event)"
                  >
                    Edit
                  </button>
                  @if (removable()) {
                    <button
                      atlasButton
                      type="button"
                      [attr.aria-label]="'Remove ' + row[keyField()]"
                      [disabled]="disabled() || !!draft()"
                      (click)="removeRequested.emit(row)"
                    >
                      Remove
                    </button>
                  }
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td
                [attr.colspan]="columns().length + 1"
                class="atlas-table-empty"
              >
                No line items. Add a line to begin.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="atlas-edit-status" role="status">
      {{
        notice() ||
          (draft()
            ? "Editing a row. Apply keeps changes in the order draft; Cancel restores the row."
            : "Select Edit to change a row.")
      }}
    </p>
  `,
})
export class AtlasEditableGrid<T extends object> {
  readonly rows = model<T[]>([]);
  readonly draft = model<T | null>(null);
  readonly columns = input.required<AtlasEditColumn<T>[]>();
  readonly keyField = input.required<keyof T & string>();
  readonly label = input("Editable records");
  readonly disabled = input(false);
  readonly removable = input(false);
  readonly removeRequested = output<T>();
  readonly rowApplied = output<T>();
  readonly attempted = signal(false);
  readonly notice = signal("");
  readonly errors = computed(() =>
    this.attempted() && this.draft()
      ? validateEditRow(this.draft()!, this.columns())
      : {},
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly id = `atlas-edit-${++gridSequence}`;
  private origin?: HTMLElement;
  private editingKey = "";
  errorId(key: string) {
    return `${this.id}-${key}`;
  }
  isEditing(row: T) {
    return (
      !!this.draft() && row[this.keyField()] === this.draft()![this.keyField()]
    );
  }
  display(row: T, column: AtlasEditColumn<T>) {
    return column.format
      ? column.format(row)
      : (column.options?.find((option) => option.value === row[column.key])
          ?.label ?? String(row[column.key] ?? ""));
  }
  begin(row: T, event?: Event) {
    if (this.disabled() || this.draft()) return;
    this.origin = event?.currentTarget as HTMLElement;
    this.editingKey = String(row[this.keyField()]);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(
          "input:not(:disabled), select:not(:disabled)",
        )
        ?.focus(),
    );
    this.draft.set(structuredClone(row));
    this.attempted.set(false);
    this.notice.set("");
  }
  edit(column: AtlasEditColumn<T>, value: string) {
    if (this.disabled() || column.readonly || !this.draft()) return;
    this.draft.update((row) => ({
      ...row!,
      [column.key]:
        column.type === "number"
          ? value === ""
            ? null
            : Number(value)
          : value,
    }));
    this.notice.set("");
  }
  apply() {
    if (this.disabled() || !this.draft()) return;
    this.attempted.set(true);
    if (Object.keys(validateEditRow(this.draft()!, this.columns())).length) {
      this.notice.set("Please correct the row before applying it.");
      return;
    }
    try {
      const row = this.draft()!;
      this.rows.set(replaceEditedRow(this.rows(), row, this.keyField()));
      this.draft.set(null);
      this.rowApplied.emit(row);
      this.notice.set("Row applied to the draft. Save the order to commit it.");
      this.restore();
    } catch (error) {
      this.notice.set((error as Error).message);
    }
  }
  cancel() {
    if (this.disabled()) return;
    this.draft.set(null);
    this.attempted.set(false);
    this.notice.set("Row changes cancelled.");
    this.restore();
  }
  private restore() {
    requestAnimationFrame(() => {
      if (this.origin?.isConnected) this.origin.focus();
      else {
        const buttons = [
          ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
            "button[data-edit-key]",
          ),
        ];
        (
          buttons.find(
            (button) => button.dataset["editKey"] === this.editingKey,
          ) ?? buttons[0]
        )?.focus();
      }
    });
  }
  key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.apply();
    }
  }
}
