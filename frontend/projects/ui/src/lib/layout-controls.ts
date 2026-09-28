import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  ElementRef,
  DestroyRef,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  signal,
} from "@angular/core";

let layoutSequence = 0;
export interface AtlasTabChoice {
  id: string;
  disabled?: boolean;
}
export function nextAtlasTab(
  tabs: readonly AtlasTabChoice[],
  current: string,
  key: string,
): string | undefined {
  const enabled = tabs.filter((tab) => !tab.disabled);
  if (!enabled.length) return undefined;
  if (key === "Home") return enabled[0].id;
  if (key === "End") return enabled[enabled.length - 1].id;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  const index = enabled.findIndex((tab) => tab.id === current);
  return enabled[
    (Math.max(0, index) + (key === "ArrowRight" ? 1 : -1) + enabled.length) %
      enabled.length
  ].id;
}
export function clampAtlasSplit(
  value: number,
  minimum = 15,
  maximum = 85,
): number {
  const low = Math.max(
    5,
    Math.min(90, Number.isFinite(minimum) ? minimum : 15),
  );
  const high = Math.max(
    low,
    Math.min(95, Number.isFinite(maximum) ? maximum : 85),
  );
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : 35));
}
@Directive({ selector: "ng-template[atlasTab]" })
export class AtlasTab {
  readonly id = input.required<string>({ alias: "atlasTab" });
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly template = inject(TemplateRef<unknown>);
}
@Component({
  selector: "atlas-tabs",
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-tabs" },
  template: `<div
      class="atlas-tab-strip"
      role="tablist"
      [attr.aria-label]="label()"
    >
      @for (tab of tabs(); track tab.id(); let i = $index) {
        <button
          type="button"
          role="tab"
          [id]="uid + '-tab-' + i"
          [attr.aria-controls]="uid + '-panel-' + i"
          [attr.aria-selected]="active() === tab.id()"
          [disabled]="tab.disabled()"
          [attr.tabindex]="active() === tab.id() ? 0 : -1"
          (click)="selected.set(tab.id())"
          (keydown)="key($event, tab.id())"
        >
          {{ tab.label() }}
        </button>
      }
    </div>
    @for (tab of tabs(); track tab.id(); let i = $index) {
      <section
        role="tabpanel"
        class="atlas-tab-body"
        [id]="uid + '-panel-' + i"
        [attr.aria-labelledby]="uid + '-tab-' + i"
        [hidden]="active() !== tab.id()"
        tabindex="0"
      >
        @if (visited().has(tab.id()) || active() === tab.id()) {
          <ng-container [ngTemplateOutlet]="tab.template" />
        }
      </section>
    }`,
})
export class AtlasTabs {
  readonly uid = `atlas-tabs-${++layoutSequence}`;
  readonly label = input("Sections");
  readonly selected = model("");
  readonly tabs = contentChildren(AtlasTab);
  readonly visited = signal(new Set<string>());
  readonly active = computed(
    () =>
      this.tabs()
        .find((tab) => tab.id() === this.selected() && !tab.disabled())
        ?.id() ??
      this.tabs()
        .find((tab) => !tab.disabled())
        ?.id() ??
      "",
  );
  constructor() {
    effect(() => {
      const id = this.active();
      if (id) this.visited.update((seen) => new Set([...seen, id]));
    });
  }
  key(event: KeyboardEvent, id: string) {
    const next = nextAtlasTab(
      this.tabs().map((tab) => ({ id: tab.id(), disabled: tab.disabled() })),
      id,
      event.key,
    );
    if (next === undefined) return;
    event.preventDefault();
    this.selected.set(next);
    const index = this.tabs().findIndex((tab) => tab.id() === next);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [index]?.focus();
  }
}
@Component({
  selector: "atlas-fieldset",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-fieldset-host" },
  template: `<fieldset class="atlas-fieldset" [disabled]="disabled()">
    <legend>
      @if (collapsible()) {
        <button
          type="button"
          [attr.aria-expanded]="!collapsed()"
          [attr.aria-controls]="uid"
          (click)="collapsed.set(!collapsed())"
        >
          <span aria-hidden="true">{{ collapsed() ? "▸" : "▾" }}</span>
          {{ label() }}
        </button>
      } @else {
        {{ label() }}
      }
    </legend>
    <div class="atlas-fieldset-body" [id]="uid" [hidden]="collapsed()">
      <ng-content />
    </div>
  </fieldset>`,
})
export class AtlasFieldset {
  readonly uid = `atlas-fieldset-${++layoutSequence}`;
  readonly label = input.required<string>();
  readonly collapsible = input(false);
  readonly collapsed = model(false);
  readonly disabled = input(false);
}
@Component({
  selector: "atlas-accordion-section",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-accordion-section" },
  template: `<h3 class="atlas-accordion-heading">
      <button
        type="button"
        [id]="uid + '-heading'"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="uid"
        (click)="expanded.set(!expanded())"
      >
        <span>{{ label() }}</span
        ><span aria-hidden="true">{{ expanded() ? "−" : "+" }}</span>
      </button>
    </h3>
    <section
      class="atlas-accordion-body"
      [id]="uid"
      [attr.aria-labelledby]="uid + '-heading'"
      [hidden]="!expanded()"
    >
      <ng-content />
    </section>`,
})
export class AtlasAccordionSection {
  readonly uid = `atlas-accordion-${++layoutSequence}`;
  readonly label = input.required<string>();
  readonly expanded = model(true);
}
@Component({
  selector: "atlas-split-pane",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "atlas-split-pane",
    "[class.is-stacked]": "narrow()",
    "[class.is-collapsed]": "collapsed()",
  },
  template: `<div class="atlas-split-controls">
      <button
        type="button"
        class="atlas-button"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-controls]="uid"
        (click)="collapsed.set(!collapsed())"
      >
        {{ collapsed() ? "Show" : "Hide" }} {{ primaryLabel() }}
      </button>
    </div>
    <div
      class="atlas-split-grid"
      [style.grid-template-columns]="
        narrow() || collapsed()
          ? 'minmax(0,1fr)'
          : size() + '% 10px minmax(0,1fr)'
      "
    >
      <section
        class="atlas-split-primary"
        [id]="uid"
        [attr.aria-label]="primaryLabel()"
        [hidden]="collapsed()"
      >
        <ng-content select="[atlasSplitPrimary]" />
      </section>
      <div
        class="atlas-splitter"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        [attr.aria-label]="'Resize ' + primaryLabel()"
        [attr.aria-controls]="uid"
        [attr.aria-valuemin]="lower()"
        [attr.aria-valuemax]="upper()"
        [attr.aria-valuenow]="size()"
        [hidden]="narrow() || collapsed()"
        (keydown)="key($event)"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="stop($event)"
        (pointercancel)="stop($event)"
        (lostpointercapture)="dragging = false"
      ></div>
      <section
        class="atlas-split-secondary"
        [attr.aria-label]="secondaryLabel()"
      >
        <ng-content select="[atlasSplitSecondary]" />
      </section>
    </div>`,
})
export class AtlasSplitPane {
  readonly uid = `atlas-split-${++layoutSequence}`;
  readonly primaryLabel = input("Navigation");
  readonly secondaryLabel = input("Details");
  readonly ratio = model(35);
  readonly minimum = input(15);
  readonly maximum = input(70);
  readonly breakpoint = input(700);
  readonly collapsed = model(false);
  readonly width = signal(1000);
  readonly narrow = computed(() => this.width() < this.breakpoint());
  readonly lower = computed(() =>
    clampAtlasSplit(0, this.minimum(), this.maximum()),
  );
  readonly upper = computed(() =>
    clampAtlasSplit(95, this.minimum(), this.maximum()),
  );
  readonly size = computed(() =>
    clampAtlasSplit(this.ratio(), this.minimum(), this.maximum()),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  dragging = false;
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver((entries) =>
        this.width.set(entries[0].contentRect.width),
      );
      observer.observe(this.host.nativeElement);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
  key(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    this.ratio.set(
      clampAtlasSplit(
        event.key === "Home"
          ? this.minimum()
          : event.key === "End"
            ? this.maximum()
            : this.size() +
              (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 2),
        this.minimum(),
        this.maximum(),
      ),
    );
  }
  start(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
  }
  move(event: PointerEvent) {
    if (!this.dragging) return;
    const bounds = this.host.nativeElement.getBoundingClientRect();
    if (bounds.width)
      this.ratio.set(
        clampAtlasSplit(
          ((event.clientX - bounds.left) / bounds.width) * 100,
          this.minimum(),
          this.maximum(),
        ),
      );
  }
  stop(event: PointerEvent) {
    this.dragging = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
  }
}
