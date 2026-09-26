import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { AtlasDialog } from "./workflow-controls";
import { AtlasWindow } from "./window-frame";
import { WorkspaceService } from "./workspace";
import { AtlasButton, AtlasIcon } from "./primitives";

@Component({
  selector: "atlas-workspace",
  imports: [AtlasDialog, AtlasWindow, AtlasButton, AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "atlas-workspace",
    "[attr.data-taskbar-dock]": "dock()",
    "[class.mobile-workspace]": "ws.mobile()",
    "(focusin)": "rememberFocus($event)",
    "(window:beforeunload)": "guardPageExit($event)",
    "(document:pointerdown)": "dismissTaskbarMenu($event)",
  },
  template: `<div class="atlas-workspace-canvas" #canvas>
      <div
        class="atlas-workspace-background"
        [inert]="ws.mobile() && !!ws.activeId()"
      >
        <ng-content />
      </div>
      @for (task of ws.tasks(); track task.id; let i = $index) {
        <atlas-window
          [task]="task"
          [layer]="ws.stackOrder().indexOf(task.id) + 1"
        />
      }
    </div>
    <div
      class="atlas-task-strip"
      aria-label="Open tasks"
      (contextmenu)="openTaskbarMenu($event)"
      (keydown)="taskbarKey($event)"
    >
      <ng-content select="[atlasWorkspaceLauncher]" />
      <button
        #settingsButton
        class="atlas-desktop-button atlas-taskbar-settings-button"
        type="button"
        aria-label="Taskbar settings"
        title="Taskbar settings"
        (click)="openSettings()"
      >
        <atlas-icon name="settings" />
      </button>
      <div class="atlas-task-scroll">
        <button
          class="atlas-desktop-button"
          aria-label="Show workspace home"
          (click)="home()"
        >
          <atlas-icon name="grid" />
        </button>
        <span class="atlas-task-divider"></span>
        @for (task of ws.tasks(); track task.id) {
          <button
            class="atlas-task-button"
            [class.active]="ws.activeId() === task.id"
            [class.minimized]="task.minimized"
            [attr.aria-pressed]="ws.activeId() === task.id"
            (click)="ws.activate(task.id)"
          >
            <atlas-icon [name]="task.icon" /><span>{{ task.title }}</span>
            @if (task.dirty()) {
              <span class="atlas-dirty-dot"></span>
            }
          </button>
        }
        @if (!ws.tasks().length) {
          <span class="atlas-no-tasks">Your open tasks will appear here</span>
        }
        <span class="atlas-task-count">{{ ws.tasks().length }} open</span>
      </div>
    </div>
    <div
      #taskbarMenu
      popover="manual"
      class="atlas-taskbar-menu"
      role="menu"
      (contextmenu)="$event.preventDefault()"
      aria-label="Taskbar customization"
      (keydown)="menuKey($event)"
    >
      <div class="atlas-taskbar-menu-heading">Dock taskbar</div>
      @for (position of positions; track position) {
        <button
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="dock() === position"
          (click)="chooseDock(position)"
        >
          {{ position }}
        </button>
      }
      <button type="button" role="menuitem" (click)="openSettings()">
        Taskbar settings…
      </button>
    </div>
    <atlas-dialog
      class="atlas-taskbar-settings-dialog"
      title="Taskbar settings"
      [(open)]="settingsOpen"
    >
      <p class="atlas-muted">Personalize your workspace</p>
      <fieldset class="atlas-dock-options">
        <legend>Taskbar location</legend>
        @for (position of positions; track position) {
          <label
            ><input
              type="radio"
              name="taskbar-dock"
              [value]="position"
              [checked]="pendingDock() === position"
              (change)="pendingDock.set(position)"
            /><span>{{ position }}</span></label
          >
        }
      </fieldset>
      <p>
        The taskbar stays inside this workspace. Your location preference is
        remembered in this browser.
      </p>
      <div atlasDialogActions class="atlas-taskbar-settings-actions">
        <button atlasButton type="button" (click)="settingsOpen.set(false)">
          Cancel</button
        ><button
          atlasButton
          type="button"
          variant="primary"
          (click)="applySettings()"
        >
          Apply
        </button>
      </div>
    </atlas-dialog>
    <dialog
      #confirm
      class="atlas-dialog"
      aria-label="Unsaved changes"
      (cancel)="cancel($event)"
    >
      @if (ws.closing(); as task) {
        <div class="atlas-dialog-icon"><atlas-icon name="save" /></div>
        <h2>Save your changes?</h2>
        <p>
          You have unsaved changes in <strong>{{ task.title }}</strong
          >. Save them before closing this task.
        </p>
        @if (task.error()) {
          <div class="atlas-alert error" role="alert">{{ task.error() }}</div>
        }
        <div class="atlas-dialog-actions">
          <button
            atlasButton
            [disabled]="task.saving()"
            (click)="ws.cancelClose()"
          >
            Keep editing</button
          ><button
            atlasButton
            variant="danger"
            [disabled]="task.saving()"
            (click)="ws.discardClose()"
          >
            Discard</button
          ><button
            atlasButton
            variant="primary"
            [disabled]="task.saving() || !task.lifecycle.save"
            (click)="ws.saveAndClose()"
          >
            {{ task.saving() ? "Saving…" : "Save & close" }}
          </button>
        </div>
      }
    </dialog>`,
})
export class AtlasWorkspace implements AfterViewInit, OnDestroy {
  readonly ws = inject(WorkspaceService);
  readonly positions = ["top", "left", "right", "bottom"] as const;
  readonly settingsOpen = signal(false);
  readonly pendingDock = signal<"top" | "left" | "right" | "bottom">("bottom");
  private readonly taskbarMenu =
    viewChild.required<ElementRef<HTMLElement>>("taskbarMenu");
  private readonly settingsButton =
    viewChild.required<ElementRef<HTMLButtonElement>>("settingsButton");
  openSettings() {
    this.taskbarMenu().nativeElement.hidePopover();
    this.settingsButton().nativeElement.focus({ preventScroll: true });
    this.pendingDock.set(this.dock());
    this.settingsOpen.set(true);
  }
  applySettings() {
    this.setDock(this.pendingDock());
    this.settingsOpen.set(false);
  }
  chooseDock(position: string) {
    this.taskbarMenu().nativeElement.hidePopover();
    this.setDock(position);
    this.settingsButton().nativeElement.focus({ preventScroll: true });
  }
  dismissTaskbarMenu(event: PointerEvent) {
    const menu = this.taskbarMenu()?.nativeElement;
    if (menu?.matches(':popover-open') && !menu.contains(event.target as Node)) menu.hidePopover();
  }
  openTaskbarMenu(event: MouseEvent) {
    event.preventDefault();
    this.showTaskbarMenu(event.clientX, event.clientY);
  }
  showTaskbarMenu(x: number, y: number) {
    const menu = this.taskbarMenu().nativeElement;
    // A contextmenu event can precede pointerup. Native auto-popover light
    // dismissal can treat that same opening gesture as an outside click.
    // Manual mode dismisses on the next outside pointerdown instead.
    menu.showPopover();
    const win = menu.ownerDocument.defaultView!;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, win.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, win.innerHeight - box.height - 8))}px`;
    menu
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }
  taskbarKey(event: KeyboardEvent) {
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      const box = (event.target as HTMLElement).getBoundingClientRect();
      this.showTaskbarMenu(box.left, box.bottom);
    }
  }
  menuKey(event: KeyboardEvent) {
    const menu = this.taskbarMenu().nativeElement;
    if (event.key === "Escape" || event.key === "Tab") {
      menu.hidePopover();
      this.settingsButton().nativeElement.focus({ preventScroll: true });
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button"),
    );
    const index = buttons.indexOf(
      menu.ownerDocument.activeElement as HTMLButtonElement,
    );
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      buttons[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
      ]?.focus();
    }
  }
  readonly forceMobile = input(false);
  readonly dock = signal<"top" | "bottom" | "left" | "right">("bottom");
  setDock(value: string) {
    if (
      value !== "top" &&
      value !== "bottom" &&
      value !== "left" &&
      value !== "right"
    )
      return;
    this.dock.set(value);
    try {
      this.element.nativeElement.ownerDocument.defaultView?.localStorage.setItem(
        "atlas.taskbar.dock",
        value,
      );
    } catch {
      /* Storage may be unavailable; keep the in-memory preference. */
    }
  }
  private readonly canvas =
    viewChild.required<ElementRef<HTMLElement>>("canvas");
  private readonly confirm =
    viewChild<ElementRef<HTMLDialogElement>>("confirm");
  private observer?: ResizeObserver;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusTargets = new Map<string, HTMLElement>();
  private destroyed = false;
  guardPageExit(event: BeforeUnloadEvent) {
    if (!this.ws.hasPendingWork()) return;
    event.preventDefault();
    // Browsers provide their own confirmation text and may require prior user interaction.
    event.returnValue = '';
  }
  constructor() {
    effect(() => {
      const tasks = this.ws.tasks();
      for (const id of this.focusTargets.keys()) {
        if (!tasks.some((task) => task.id === id)) this.focusTargets.delete(id);
      }
    });
    effect(() => {
      const activeId = this.ws.activeId();
      queueMicrotask(() => {
        if (this.destroyed || !activeId || this.ws.pendingClose()) return;
        const host = this.element.nativeElement;
        const frame = host.querySelector<HTMLElement>(
          `[data-task-id="${activeId}"]`,
        );
        if (!frame || frame.contains(host.ownerDocument.activeElement)) return;
        const previous = this.focusTargets.get(activeId);
        (previous?.isConnected && !previous.hasAttribute("disabled")
          ? previous
          : frame
        ).focus({ preventScroll: true });
      });
    });
    effect(() => {
      const dialog = this.confirm()?.nativeElement;
      const pending = this.ws.pendingClose();
      if (!dialog) return;
      if (pending && !dialog.open) dialog.showModal();
      else if (!pending && dialog.open) dialog.close();
    });
    effect(() => {
      this.forceMobile();
      if (this.observer) this.measure();
    });
  }
  ngAfterViewInit() {
    try {
      const stored =
        this.element.nativeElement.ownerDocument.defaultView?.localStorage.getItem(
          "atlas.taskbar.dock",
        );
      if (
        stored === "top" ||
        stored === "bottom" ||
        stored === "left" ||
        stored === "right"
      )
        this.dock.set(stored);
    } catch {
      /* Use default docking when storage is unavailable. */
    }
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this.canvas().nativeElement);
    this.measure();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.observer?.disconnect();
    this.focusTargets.clear();
  }
  rememberFocus(event: FocusEvent) {
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>("[data-task-id]")?.dataset["taskId"];
    if (id) this.focusTargets.set(id, target);
  }
  measure() {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    this.ws.setViewport(
      rect.width,
      rect.height,
      this.forceMobile() ||
        this.element.nativeElement.getBoundingClientRect().width < 700,
    );
  }
  home() {
    for (const task of this.ws.tasks()) this.ws.minimize(task.id);
    this.ws.showDesktop();
  }
  cancel(event: Event) {
    event.preventDefault();
    this.ws.cancelClose();
  }
}
