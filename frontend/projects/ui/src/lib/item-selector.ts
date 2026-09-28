import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import { AtlasChoiceState } from "./choice-controls";
import { AtlasOption, filterCollection } from "./collection";
import { AtlasButton, AtlasInput } from "./primitives";

export function atlasTransferItems(
  value: readonly string[],
  selection: readonly string[],
  options: readonly AtlasOption[],
  add: boolean,
  limit = 0,
): string[] {
  const enabled = new Set(
    options.filter((option) => !option.disabled).map((option) => option.value),
  );
  const eligible = selection.filter((id) => enabled.has(id));
  const next = add
    ? [...new Set([...value, ...eligible])]
    : value.filter((id) => !eligible.includes(id));
  return add && limit > 0 && next.length > limit ? [...value] : next;
}
export function atlasMoveItems(
  value: readonly string[],
  selection: readonly string[],
  options: readonly AtlasOption[],
  direction: -1 | 1,
): string[] {
  const enabled = new Set(
    options.filter((option) => !option.disabled).map((option) => option.value),
  );
  const selected = new Set(selection.filter((id) => enabled.has(id)));
  const next = [...value];
  const indexes = Array.from({ length: next.length }, (_, i) => i);
  if (direction === 1) indexes.reverse();
  for (const index of indexes) {
    const to = index + direction;
    if (
      selected.has(next[index]) &&
      to >= 0 &&
      to < next.length &&
      !selected.has(next[to]) &&
      enabled.has(next[to])
    )
      [next[index], next[to]] = [next[to], next[index]];
  }
  return next;
}
@Component({
  selector: "atlas-item-selector",
  imports: [AtlasButton, AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(focusout)": "touch.emit()" },
  template: `<fieldset
    class="atlas-item-selector"
    [id]="controlId()"
    [disabled]="disabled()"
    [attr.aria-describedby]="describedBy()"
    [attr.aria-invalid]="invalid() && touched()"
  >
    <legend>{{ label() }}</legend>
    <div class="atlas-item-selector-grid">
      <div class="atlas-item-selector-list">
        <label [for]="controlId() + '-available'"
          >{{ availableLabel() }} · {{ available().length }}</label
        >
        <input
          atlasInput
          type="search"
          [attr.aria-label]="'Search ' + availableLabel()"
          placeholder="Filter available…"
          [value]="search()"
          (input)="
            search.set($any($event.target).value); availableSelection.set([])
          "
        />
        <select
          multiple
          size="8"
          [id]="controlId() + '-available'"
          [attr.aria-describedby]="controlId() + '-help'"
          (change)="choose($event, false)"
          (keydown)="key($event, false)"
        >
          @for (option of available(); track option.value) {
            <option
              [value]="option.value"
              [disabled]="option.disabled"
              [selected]="availableSelection().includes(option.value)"
            >
              {{ option.label
              }}{{ option.description ? " · " + option.description : "" }}
            </option>
          }
        </select>
      </div>
      <div class="atlas-item-selector-actions">
        <button
          atlasButton
          type="button"
          [disabled]="readonly() || !availableSelection().length"
          (click)="transfer(true)"
        >
          Add →
        </button>
        <button
          atlasButton
          type="button"
          [disabled]="readonly() || !assignedSelection().length"
          (click)="transfer(false)"
        >
          ← Remove
        </button>
      </div>
      <div class="atlas-item-selector-list">
        <label [for]="controlId() + '-assigned'"
          >{{ assignedLabel() }} · {{ value().length
          }}{{ limit() ? " / " + limit() : "" }}</label
        >
        <select
          multiple
          size="8"
          [id]="controlId() + '-assigned'"
          [attr.aria-describedby]="controlId() + '-help'"
          (change)="choose($event, true)"
          (keydown)="key($event, true)"
        >
          @for (option of assigned(); track option.value) {
            <option
              [value]="option.value"
              [disabled]="option.disabled"
              [selected]="assignedSelection().includes(option.value)"
            >
              {{ option.label
              }}{{ option.description ? " · " + option.description : "" }}
            </option>
          }
        </select>
        @if (reorderable()) {
          <div class="atlas-item-selector-order">
            <button
              atlasButton
              type="button"
              [disabled]="readonly() || !canMove(-1)"
              (click)="move(-1)"
            >
              Move up</button
            ><button
              atlasButton
              type="button"
              [disabled]="readonly() || !canMove(1)"
              (click)="move(1)"
            >
              Move down
            </button>
          </div>
        }
      </div>
    </div>
    <p class="atlas-muted" [id]="controlId() + '-help'">
      {{ readonly() ? "Read-only. " : "" }}Use Ctrl/⌘ or Shift to select
      multiple items. Alt+Right adds, Alt+Left removes; Alt+Up/Down reorders
      assigned items.
    </p>
    <p role="status">{{ message() }}</p>
  </fieldset>`,
})
export class AtlasItemSelector
  extends AtlasChoiceState
  implements FormValueControl<string[]>
{
  readonly value = model<string[]>([]);
  readonly availableLabel = input("Available");
  readonly assignedLabel = input("Assigned");
  readonly limit = input(0);
  readonly reorderable = input(true);
  readonly search = signal("");
  readonly availableSelection = signal<string[]>([]);
  readonly assignedSelection = signal<string[]>([]);
  readonly message = signal("");
  readonly available = computed(() =>
    filterCollection(
      this.options().filter((option) => !this.value().includes(option.value)),
      this.search(),
      (option) => `${option.label} ${option.description ?? ""}`,
    ),
  );
  readonly assigned = computed(() =>
    this.value().map(
      (value) =>
        this.options().find((option) => option.value === value) ?? {
          value,
          label: `Unavailable (${value})`,
          disabled: true,
        },
    ),
  );
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  override focus(options?: FocusOptions) {
    this.element.nativeElement
      .querySelector<HTMLSelectElement>("select:not(:disabled)")
      ?.focus(options);
  }
  choose(event: Event, assigned: boolean) {
    (assigned ? this.assignedSelection : this.availableSelection).set(
      [...(event.target as HTMLSelectElement).selectedOptions].map(
        (option) => option.value,
      ),
    );
  }
  transfer(add: boolean) {
    if (this.disabled() || this.readonly()) return;
    const selection = add
      ? this.availableSelection().filter((id) =>
          this.available().some((option) => option.value === id),
        )
      : this.assignedSelection();
    const next = atlasTransferItems(
      this.value(),
      selection,
      this.options(),
      add,
      this.limit(),
    );
    const count = Math.abs(next.length - this.value().length);
    this.value.set(next);
    this.touch.emit();
    this.message.set(
      count
        ? `${count} ${count === 1 ? "item" : "items"} ${add ? "added" : "removed"}.`
        : add && selection.length
          ? `Nothing added. Assignment limit: ${this.limit() || "unlimited"}.`
          : "No items changed.",
    );
    if (count) {
      this.availableSelection.set([]);
      this.assignedSelection.set([]);
    }
  }
  canMove(direction: -1 | 1) {
    return atlasMoveItems(
      this.value(),
      this.assignedSelection(),
      this.options(),
      direction,
    ).some((id, i) => id !== this.value()[i]);
  }
  move(direction: -1 | 1) {
    if (this.disabled() || this.readonly() || !this.reorderable()) return;
    this.value.set(
      atlasMoveItems(
        this.value(),
        this.assignedSelection(),
        this.options(),
        direction,
      ),
    );
    this.touch.emit();
    this.message.set("Assignment order updated.");
  }
  key(event: KeyboardEvent, assigned: boolean) {
    if (!event.altKey) return;
    if (!assigned && event.key === "ArrowRight") {
      event.preventDefault();
      this.transfer(true);
    }
    if (assigned && event.key === "ArrowLeft") {
      event.preventDefault();
      this.transfer(false);
    }
    if (
      assigned &&
      this.reorderable() &&
      ["ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      this.move(event.key === "ArrowUp" ? -1 : 1);
    }
  }
}
