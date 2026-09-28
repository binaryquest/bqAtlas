import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { AtlasTreeNode, AtlasTreeRow, flattenTree } from "./tree-model";

/** null means selection is incomplete because an enabled branch is still unloaded. Disabled subtrees are excluded. */
export function atlasCheckLeaves(node: AtlasTreeNode): string[] | null {
  if (node.disabled) return [];
  if (node.hasChildren && node.children === undefined) return null;
  if (!node.children?.length) return node.hasChildren ? [] : [node.id];
  const leaves: string[] = [];
  for (const child of node.children) {
    const result = atlasCheckLeaves(child);
    if (result === null) return null;
    leaves.push(...result);
  }
  return leaves;
}
export function atlasCheckState(
  node: AtlasTreeNode,
  checked: readonly string[],
): boolean | "mixed" {
  const leaves = atlasCheckLeaves(node);
  if (leaves === null) {
    return node.children?.some(
      (child) => atlasCheckState(child, checked) !== false,
    )
      ? "mixed"
      : false;
  }
  if (!leaves.length) return false;
  const count = leaves.filter((id) => checked.includes(id)).length;
  return count === leaves.length ? true : count > 0 ? "mixed" : false;
}
export function atlasToggleChecks(
  node: AtlasTreeNode,
  checked: readonly string[],
): string[] {
  const leaves = atlasCheckLeaves(node);
  if (!leaves?.length) return [...checked];
  const result = new Set(checked);
  const remove = leaves.every((id) => result.has(id));
  for (const id of leaves) {
    if (remove) result.delete(id);
    else result.add(id);
  }
  return [...result];
}
export interface AtlasTreeGridColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

@Directive()
export class AtlasHierarchyBase {
  readonly nodes = input<readonly AtlasTreeNode[]>([]);
  readonly label = input("Hierarchy");
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly expandedIds = model<string[]>([]);
  readonly selectedId = model<string | null>(null);
  readonly checkedIds = model<string[]>([]);
  /** Adapter inserts children immutably and owns node loading/error state. */
  readonly loadChildren = output<AtlasTreeNode>();
  readonly nodeSelected = output<AtlasTreeNode>();
  readonly focused = signal<string | null>(null);
  readonly visible = computed(() =>
    flattenTree(this.nodes(), this.expandedIds()),
  );
  readonly tabstop = computed(() =>
    this.visible().some((row) => row.node.id === this.focused())
      ? this.focused()
      : this.visible()[0]?.node.id,
  );
  branch(node: AtlasTreeNode) {
    return !!node.children?.length || !!node.hasChildren;
  }
  blocked(row: AtlasTreeRow) {
    if (this.disabled() || row.node.disabled) return true;
    let parent = row.parent;
    while (parent) {
      const ancestor = this.visible().find((item) => item.node.id === parent);
      if (ancestor?.node.disabled) return true;
      parent = ancestor?.parent ?? null;
    }
    return false;
  }
  checkBlocked(row: AtlasTreeRow) {
    return (
      this.blocked(row) ||
      this.readonly() ||
      !atlasCheckLeaves(row.node)?.length
    );
  }
  state(node: AtlasTreeNode) {
    return atlasCheckState(node, this.checkedIds());
  }
  check(row: AtlasTreeRow) {
    if (!this.checkBlocked(row))
      this.checkedIds.set(atlasToggleChecks(row.node, this.checkedIds()));
  }
  toggle(row: AtlasTreeRow) {
    if (!this.branch(row.node) || this.blocked(row)) return;
    const expanded = this.expandedIds().includes(row.node.id);
    this.expandedIds.update((ids) =>
      expanded ? ids.filter((id) => id !== row.node.id) : [...ids, row.node.id],
    );
    if (!expanded && row.node.children === undefined && !row.node.loading)
      this.loadChildren.emit(row.node);
  }
  retry(row: AtlasTreeRow) {
    if (!this.blocked(row) && !row.node.loading)
      this.loadChildren.emit(row.node);
  }
  choose(row: AtlasTreeRow) {
    if (this.blocked(row) || this.readonly()) return;
    this.selectedId.set(row.node.id);
    this.nodeSelected.emit(row.node);
  }
  key(event: KeyboardEvent, row: AtlasTreeRow, checks = false) {
    const rows = this.visible(),
      index = rows.findIndex((item) => item.node.id === row.node.id);
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
        if (this.branch(row.node)) {
          if (!row.expanded) this.toggle(row);
          else if (row.node.children?.length) target = index + 1;
        }
        break;
      case "ArrowLeft":
        if (row.expanded) this.toggle(row);
        else if (row.parent)
          target = rows.findIndex((item) => item.node.id === row.parent);
        break;
      case "Enter":
        if (row.node.error) this.retry(row);
        else if (checks) this.check(row);
        else this.choose(row);
        break;
      case " ":
        if (checks) this.check(row);
        else this.choose(row);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (rows[target]) {
      this.focused.set(rows[target].node.id);
      const root = (event.currentTarget as HTMLElement).closest(
        '[role="tree"], [role="treegrid"]',
      );
      root
        ?.querySelectorAll<HTMLElement>("[data-hierarchy-row]")
        [target]?.focus();
    }
  }
}
@Component({
  selector: "atlas-check-tree",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="atlas-tree atlas-check-tree"
      role="tree"
      [attr.aria-label]="label()"
      aria-multiselectable="true"
    >
      @for (row of visible(); track row.node.id) {
        <div
          class="atlas-tree-row"
          role="treeitem"
          data-hierarchy-row
          [style.--atlas-tree-depth]="row.level - 1"
          [attr.aria-level]="row.level"
          [attr.aria-posinset]="row.position"
          [attr.aria-setsize]="row.size"
          [attr.aria-expanded]="branch(row.node) ? row.expanded : null"
          [attr.aria-checked]="state(row.node)"
          [attr.aria-disabled]="checkBlocked(row)"
          [attr.aria-busy]="row.node.loading || false"
          [attr.tabindex]="tabstop() === row.node.id ? 0 : -1"
          (focus)="focused.set(row.node.id)"
          (keydown)="key($event, row, true)"
        >
          <button
            type="button"
            tabindex="-1"
            class="atlas-tree-disclosure"
            [disabled]="!branch(row.node) || blocked(row)"
            [attr.aria-label]="
              (row.expanded ? 'Collapse ' : 'Expand ') + row.node.label
            "
            (click)="toggle(row)"
          >
            {{ branch(row.node) ? (row.expanded ? "▾" : "▸") : "·" }}
          </button>
          <input
            type="checkbox"
            tabindex="-1"
            [attr.aria-label]="'Check ' + row.node.label"
            [checked]="state(row.node) === true"
            [indeterminate]="state(row.node) === 'mixed'"
            [disabled]="checkBlocked(row)"
            (change)="check(row)"
          />
          <span class="atlas-tree-label"
            ><strong>{{ row.node.label }}</strong
            ><small>{{ row.node.description }}</small></span
          >
          @if (row.node.loading) {
            <small role="status">Loading…</small>
          }
          @if (row.node.error) {
            <span role="alert">{{ row.node.error }}</span
            ><button
              type="button"
              tabindex="-1"
              [disabled]="blocked(row)"
              (click)="retry(row)"
            >
              Retry
            </button>
          }
        </div>
      } @empty {
        <p class="atlas-options-empty">No nodes.</p>
      }
    </div>
  `,
})
export class AtlasCheckTree extends AtlasHierarchyBase {}

@Component({
  selector: "atlas-tree-grid",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="atlas-table-scroll">
      <table
        class="atlas-table atlas-tree-grid"
        role="treegrid"
        [attr.aria-label]="label()"
        [attr.aria-readonly]="readonly()"
      >
        <thead>
          <tr>
            <th scope="col">{{ hierarchyLabel() }}</th>
            @for (column of columns(); track column.key) {
              <th scope="col" [style.text-align]="column.align || 'left'">
                {{ column.label }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of visible(); track row.node.id) {
            <tr
              role="row"
              data-hierarchy-row
              [attr.aria-level]="row.level"
              [attr.aria-posinset]="row.position"
              [attr.aria-setsize]="row.size"
              [attr.aria-expanded]="branch(row.node) ? row.expanded : null"
              [attr.aria-selected]="selectedId() === row.node.id"
              [attr.aria-disabled]="blocked(row)"
              [attr.aria-busy]="row.node.loading || false"
              [attr.tabindex]="tabstop() === row.node.id ? 0 : -1"
              [class.selected]="selectedId() === row.node.id"
              (focus)="focused.set(row.node.id)"
              (keydown)="key($event, row)"
              (click)="choose(row)"
            >
              <td role="gridcell">
                <div
                  class="atlas-hierarchy-cell"
                  [style.--atlas-tree-depth]="row.level - 1"
                >
                  <button
                    type="button"
                    tabindex="-1"
                    class="atlas-tree-disclosure"
                    [disabled]="!branch(row.node) || blocked(row)"
                    [attr.aria-label]="
                      (row.expanded ? 'Collapse ' : 'Expand ') + row.node.label
                    "
                    (click)="$event.stopPropagation(); toggle(row)"
                  >
                    {{ branch(row.node) ? (row.expanded ? "▾" : "▸") : "·" }}
                  </button>
                  <span class="atlas-tree-label"
                    ><strong>{{ row.node.label }}</strong
                    ><small>{{ row.node.description }}</small></span
                  >
                  @if (row.node.loading) {
                    <small role="status">Loading…</small>
                  }
                  @if (row.node.error) {
                    <span role="alert">{{ row.node.error }}</span
                    ><button
                      type="button"
                      tabindex="-1"
                      [disabled]="blocked(row)"
                      (click)="$event.stopPropagation(); retry(row)"
                    >
                      Retry
                    </button>
                  }
                </div>
              </td>
              @for (column of columns(); track column.key) {
                <td role="gridcell" [style.text-align]="column.align || 'left'">
                  {{ row.node.values?.[column.key] ?? "—" }}
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="columns().length + 1">No nodes.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AtlasTreeGrid extends AtlasHierarchyBase {
  readonly columns = input<readonly AtlasTreeGridColumn[]>([]);
  readonly hierarchyLabel = input("Account / item");
}
