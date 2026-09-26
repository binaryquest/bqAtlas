import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  inject,
  contentChild,
  computed,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { AtlasBadge, AtlasButton, AtlasIcon, AtlasInput } from "./primitives";
import { filterCollection, pageCollection } from "./collection";
export interface AtlasListItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  icon?: string;
  badge?: string;
  tone?: "neutral" | "success" | "warning" | "info" | "danger";
  disabled?: boolean;
}
@Directive({ selector: "ng-template[atlasListTemplate]" })
export class AtlasListTemplate {
  template =
    inject<TemplateRef<{ $implicit: AtlasListItem; selected: boolean }>>(
      TemplateRef,
    );
  static ngTemplateContextGuard(
    _directive: AtlasListTemplate,
    context: unknown,
  ): context is { $implicit: AtlasListItem; selected: boolean } {
    return true;
  }
}
@Component({
  selector: "atlas-list-view",
  imports: [AtlasBadge, AtlasIcon, AtlasInput, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-list-view" },
  template: `@if (filterable()) {
      <div class="atlas-collection-toolbar">
        <div class="atlas-collection-search">
          <atlas-icon name="search" /><input
            atlasInput
            [attr.aria-label]="'Search ' + label()"
            placeholder="Search records…"
            [value]="query()"
            (input)="search($any($event.target).value)"
          />
        </div>
        <span class="atlas-collection-count"
          >{{ filtered().length }}
          {{ filtered().length === 1 ? "record" : "records" }}</span
        >
      </div>
    }
    <div
      class="atlas-list-items"
      [class.is-grid]="layout() === 'grid'"
      role="listbox"
      [attr.aria-label]="label()"
      [attr.aria-busy]="loading()"
    >
      @if (loading()) {
        <div class="atlas-options-empty" role="status">Loading records…</div>
      } @else {
        @for (item of paged().items; track item.id; let i = $index) {
          <button
            type="button"
            class="atlas-list-item"
            role="option"
            [attr.aria-selected]="selectedId() === item.id"
            [disabled]="item.disabled"
            [attr.aria-disabled]="!!item.disabled"
            [class.is-selected]="selectedId() === item.id"
            [attr.tabindex]="tabstop() === item.id ? 0 : -1"
            (click)="select(item)"
            (dblclick)="itemActivated.emit(item)"
            (keydown)="key($event, item)"
          >
            @if (itemTemplate(); as custom) {
              <ng-container
                [ngTemplateOutlet]="custom.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  selected: selectedId() === item.id,
                }"
              />
            } @else {
              <span class="atlas-list-item-icon"
                ><atlas-icon [name]="item.icon || 'box'" /></span
              ><span class="atlas-list-item-content"
                ><strong>{{ item.title }}</strong>
                @if (item.description) {
                  <small>{{ item.description }}</small>
                }
                @if (item.meta) {
                  <span class="atlas-list-meta">{{ item.meta }}</span>
                }
              </span>
              @if (item.badge) {
                <atlas-badge [tone]="item.tone || 'neutral'">{{
                  item.badge
                }}</atlas-badge>
              }
            }
            @if (selectedId() === item.id) {
              <atlas-icon class="atlas-list-check" name="check" />
            }
          </button>
        } @empty {
          <div class="atlas-options-empty">No records match your search.</div>
        }
      }
    </div>
    <footer class="atlas-table-footer">
      <span
        >{{ selectedId() ? "1 selected" : "Select a record" }} · Page
        {{ paged().page + 1 }} of {{ paged().pages }}</span
      >
      <div>
        <button
          type="button"
          class="atlas-window-control"
          aria-label="Previous list page"
          [disabled]="paged().page === 0"
          (click)="changePage(-1)"
        >
          <atlas-icon name="back" /></button
        ><button
          type="button"
          class="atlas-window-control"
          aria-label="Next list page"
          [disabled]="paged().page + 1 === paged().pages"
          (click)="changePage(1)"
        >
          <atlas-icon name="arrow" />
        </button>
      </div>
    </footer>`,
})
export class AtlasListView {
  readonly itemTemplate = contentChild(AtlasListTemplate);
  readonly tabstop = computed(
    () =>
      this.paged().items.find(
        (item) => item.id === this.focusId() && !item.disabled,
      )?.id ?? this.paged().items.find((item) => !item.disabled)?.id,
  );
  readonly items = input<AtlasListItem[]>([]);
  readonly label = input("Records");
  readonly layout = input<"list" | "grid">("list");
  readonly filterable = input(true);
  readonly loading = input(false);
  readonly pageSize = input(5);
  readonly selectedId = model<string | null>(null);
  readonly selectionChange = output<AtlasListItem>();
  readonly itemActivated = output<AtlasListItem>();
  readonly query = signal("");
  readonly page = signal(0);
  readonly focusId = signal<string | null>(null);
  readonly filtered = computed(() =>
    filterCollection(
      this.items(),
      this.query(),
      (item) => `${item.title} ${item.description ?? ""} ${item.meta ?? ""}`,
    ),
  );
  readonly paged = computed(() =>
    pageCollection(this.filtered(), this.page(), this.pageSize()),
  );
  readonly firstEnabled = computed(() =>
    this.paged().items.findIndex((item) => !item.disabled),
  );
  search(query: string) {
    this.query.set(query);
    this.page.set(0);
    this.focusId.set(null);
  }
  changePage(delta: number) {
    this.page.set(this.paged().page + delta);
    this.focusId.set(null);
  }
  select(item: AtlasListItem) {
    if (item.disabled) return;
    this.selectedId.set(item.id);
    this.focusId.set(item.id);
    this.selectionChange.emit(item);
  }
  key(event: KeyboardEvent, item: AtlasListItem) {
    if (event.key === "Enter") {
      event.preventDefault();
      this.select(item);
      this.itemActivated.emit(item);
      return;
    }
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const items = this.paged().items.filter((item) => !item.disabled);
    const current = items.findIndex((value) => value.id === item.id);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current +
              (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) +
              items.length) %
            items.length;
    const next = items[index];
    if (next) {
      this.select(next);
      const host = (event.currentTarget as HTMLElement).parentElement!;
      const buttons = [
        ...host.querySelectorAll<HTMLButtonElement>(
          'button[role="option"]:not(:disabled)',
        ),
      ];
      buttons[index]?.focus();
    }
  }
}
