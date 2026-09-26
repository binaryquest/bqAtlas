import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
  viewChild,
  ElementRef,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import { AtlasInput } from "./primitives";
import {
  AtlasTreeNode,
  AtlasTreeRow,
  flattenTree,
  findTreeNode,
} from "./tree-model";
@Component({
  selector: "atlas-tree",
  imports: [AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filterable()) {
      <input
        atlasInput
        type="search"
        [attr.aria-label]="'Search ' + label()"
        placeholder="Search hierarchy…"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
    }
    <div
      class="atlas-tree"
      role="tree"
      [attr.aria-label]="label()"
      [attr.aria-busy]="loading()"
    >
      @if (!loading() && !error()) {
        @for (row of visible(); track row.node.id) {
          <button
            type="button"
            role="treeitem"
            class="atlas-tree-row"
            [style.--atlas-tree-depth]="row.level - 1"
            [attr.aria-level]="row.level"
            [attr.aria-posinset]="row.position"
            [attr.aria-setsize]="row.size"
            [attr.aria-expanded]="
              row.node.children?.length ? row.expanded : null
            "
            [attr.aria-selected]="selectedId() === row.node.id"
            [attr.aria-disabled]="
              disabled() ||
              row.node.disabled ||
              (leafOnly() && !!row.node.children?.length)
            "
            [attr.tabindex]="tabstop() === row.node.id ? 0 : -1"
            (focus)="focused.set(row.node.id)"
            (click)="choose(row)"
            (keydown)="key($event, row)"
          >
            <span
              class="atlas-tree-disclosure"
              aria-hidden="true"
              (click)="$event.stopPropagation(); toggle(row)"
              >{{
                row.node.children?.length ? (row.expanded ? "▾" : "▸") : "·"
              }}</span
            >
            <span class="atlas-tree-label"
              ><strong>{{ row.node.label }}</strong>
              @if (row.node.description) {
                <small>{{ row.node.description }}</small>
              }
            </span>
            @if (selectedId() === row.node.id) {
              <span aria-hidden="true">✓</span>
            }
          </button>
        }
      }
    </div>
    @if (loading()) {
      <p class="atlas-options-empty" role="status">Loading hierarchy…</p>
    } @else if (error()) {
      <div class="atlas-options-empty">
        <p role="alert">{{ error() }}</p>
        <button type="button" (click)="retry.emit()">Retry</button>
      </div>
    } @else if (!visible().length) {
      <p class="atlas-options-empty" role="status">No matching nodes.</p>
    }
  `,
})
export class AtlasTree {
  readonly nodes = input<readonly AtlasTreeNode[]>([]);
  readonly label = input("Hierarchy");
  readonly filterable = input(true);
  readonly leafOnly = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly loading = input(false);
  readonly error = input("");
  readonly retry = output<void>();
  readonly selectedId = model<string | null>(null);
  readonly expandedIds = model<string[]>([]);
  readonly nodeSelected = output<AtlasTreeNode>();
  readonly query = signal("");
  readonly focused = signal<string | null>(null);
  readonly visible = computed(() =>
    flattenTree(this.nodes(), this.expandedIds(), this.query()),
  );
  readonly tabstop = computed(() =>
    this.visible().some((r) => r.node.id === this.focused())
      ? this.focused()
      : this.visible()[0]?.node.id,
  );
  toggle(row: AtlasTreeRow) {
    if (this.disabled() || !row.node.children?.length || this.query().trim())
      return;
    this.expandedIds.update((ids) =>
      ids.includes(row.node.id)
        ? ids.filter((id) => id !== row.node.id)
        : [...ids, row.node.id],
    );
  }
  choose(row: AtlasTreeRow) {
    if (
      this.disabled() ||
      this.readonly() ||
      row.node.disabled ||
      (this.leafOnly() && row.node.children?.length)
    )
      return;
    this.selectedId.set(row.node.id);
    this.nodeSelected.emit(row.node);
  }
  key(event: KeyboardEvent, item: AtlasTreeRow) {
    const rows = this.visible(),
      index = rows.findIndex((row) => row.node.id === item.node.id);
    const row = rows[index];
    if (!row) return;
    let target = index;
    switch (event.key) {
      case "ArrowDown":
        target = Math.min(rows.length - 1, index + 1);
        break;
      case "ArrowUp":
        target = Math.max(0, index - 1);
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = rows.length - 1;
        break;
      case "ArrowRight":
        if (row.node.children?.length) {
          if (!row.expanded) this.toggle(row);
          else target = Math.min(rows.length - 1, index + 1);
        }
        break;
      case "ArrowLeft":
        if (row.expanded && !this.query().trim()) this.toggle(row);
        else if (row.parent)
          target = rows.findIndex((r) => r.node.id === row.parent);
        break;
      case "Enter":
      case " ":
        this.choose(row);
        break;
      default:
        return;
    }
    event.preventDefault();
    const node = rows[target];
    if (node) {
      this.focused.set(node.node.id);
      (event.currentTarget as HTMLElement).parentElement
        ?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')
        [target]?.focus();
    }
  }
}
@Component({
  selector: "atlas-tree-select",
  imports: [AtlasTree],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(focusout)": "touchedChange.emit(true)" },
  template: `
    <button
      #trigger
      type="button"
      class="atlas-tree-select-trigger atlas-input"
      [id]="controlId()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-invalid]="invalid()"
      [attr.aria-describedby]="describedBy()"
      (click)="open.update(invert)"
    >
      {{ selected()?.label || placeholder() }} <span aria-hidden="true">▾</span>
    </button>
    @if (open()) {
      <div class="atlas-tree-select-panel" (keydown.escape)="close($event)">
        <atlas-tree
          [nodes]="nodes()"
          [label]="label()"
          [selectedId]="value()"
          [leafOnly]="leafOnly()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [loading]="loading()"
          [error]="error()"
          (retry)="retry.emit()"
          (nodeSelected)="commit($event)"
        />
        <div class="atlas-tree-select-actions">
          <button
            type="button"
            [disabled]="disabled() || readonly() || !value()"
            (click)="clear()"
          >
            Clear selection</button
          ><button type="button" (click)="close()">Done</button>
        </div>
      </div>
    }
  `,
})
export class AtlasTreeSelect implements FormValueControl<string | null> {
  readonly nodes = input<readonly AtlasTreeNode[]>([]);
  readonly value = model<string | null>(null);
  readonly label = input("Choose a node");
  readonly placeholder = input("Choose a node…");
  readonly controlId = input("");
  readonly describedBy = input<string | undefined>();
  readonly leafOnly = input(true);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touchedChange = output<boolean>();
  readonly loading = input(false);
  readonly error = input("");
  readonly retry = output<void>();
  readonly open = signal(false);
  readonly selected = computed(() => findTreeNode(this.nodes(), this.value()));
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  readonly invert = (value: boolean) => !value;
  focus() {
    this.trigger()?.nativeElement.focus();
  }
  close(event?: Event) {
    event?.stopPropagation();
    this.open.set(false);
    this.touchedChange.emit(true);
    this.focus();
  }
  commit(node: AtlasTreeNode) {
    if (this.disabled() || this.readonly()) return;
    this.value.set(node.id);
    this.close();
  }
  clear() {
    if (this.disabled() || this.readonly()) return;
    this.value.set(null);
    this.close();
  }
}
