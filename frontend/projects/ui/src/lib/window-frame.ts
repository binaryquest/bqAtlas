import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgComponentOutlet } from "@angular/common";
import {
  ATLAS_TASK,
  WindowBounds,
  WorkspaceService,
  WorkspaceTask,
} from "./workspace";
import { AtlasIcon } from "./primitives";

@Component({
  selector: "atlas-window",
  imports: [NgComponentOutlet, AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "atlas-window",
    "[class.is-active]": "ws.activeId()===task().id",
    "[class.is-maximized]": 'task().mode==="maximized"',
    "[class.is-mobile]": "ws.mobile()",
    "[class.is-hidden]":
      "task().minimized || (ws.mobile() && ws.activeId()!==task().id)",
    "[style.left.px]": "task().bounds.x",
    "[style.top.px]": "task().bounds.y",
    "[style.width.px]": "task().bounds.width",
    "[style.height.px]": "task().bounds.height",
    "[style.z-index]": "layer()",
    "[attr.aria-labelledby]": 'task().id+"-title"',
    "[attr.data-task-id]": "task().id",
    role: "region",
    tabindex: "-1",
    "(pointerdown)": "activate()",
    "(focusin)": "activate()",
    "(keydown.control.s)": "saveShortcut($event)",
    "(keydown.meta.s)": "saveShortcut($event)",
  },
  template: `
    <header
      class="atlas-window-titlebar"
      tabindex="0"
      aria-label="Window title bar. Use arrow keys to move."
      (keydown)="moveKey($event)"
      (pointerdown)="start($event, 'move')"
      (pointermove)="move($event)"
      (pointerup)="end($event)"
      (pointercancel)="end($event)"
      (dblclick)="maximize($event)"
    >
      @if (ws.mobile()) {
        <button
          class="atlas-window-control"
          aria-label="Back to previous task"
          (click)="ws.back()"
        >
          <atlas-icon name="back" />
        </button>
      }
      <span class="atlas-window-symbol"
        ><atlas-icon [name]="task().icon"
      /></span>
      <h2 [id]="task().id + '-title'">{{ task().title }}</h2>
      @if (task().dirty()) {
        <span
          class="atlas-dirty-dot"
          title="Unsaved changes"
          aria-label="Unsaved changes"
        ></span>
      }
      <span class="atlas-window-title-spacer"></span>
      @if (!ws.mobile()) {
        <button
          class="atlas-window-control snap-control"
          aria-label="Snap window left"
          title="Snap left"
          (click)="ws.snap(task().id, 'left')"
        >
          <atlas-icon name="left" />
        </button>
        <button
          class="atlas-window-control snap-control"
          aria-label="Snap window right"
          title="Snap right"
          (click)="ws.snap(task().id, 'right')"
        >
          <atlas-icon name="right" />
        </button>
        <span class="atlas-title-divider"></span>
        <button
          class="atlas-window-control"
          aria-label="Minimize window"
          title="Minimize"
          (click)="ws.minimize(task().id)"
        >
          <atlas-icon name="minimize" />
        </button>
        <button
          class="atlas-window-control"
          [attr.aria-label]="
            task().mode === 'maximized' ? 'Restore window' : 'Maximize window'
          "
          (click)="ws.toggleMaximize(task().id)"
        >
          <atlas-icon
            [name]="task().mode === 'maximized' ? 'restore' : 'maximize'"
          />
        </button>
      }
      <button
        class="atlas-window-control close-control"
        aria-label="Close window"
        [disabled]="task().saving()"
        (click)="ws.requestClose(task().id)"
      >
        <atlas-icon name="close" />
      </button>
    </header>
    <div class="atlas-window-content">
      <ng-container
        *ngComponentOutlet="task().component; injector: taskInjector"
      />
    </div>
    @if (!ws.mobile() && task().mode === "floating") {
      @for (edge of edges; track edge) {
        <div
          class="atlas-resize-handle"
          [attr.data-edge]="edge"
          (pointerdown)="start($event, edge)"
          (pointermove)="move($event)"
          (pointerup)="end($event)"
          (pointercancel)="end($event)"
        ></div>
      }
      <button
        class="atlas-resize-keyboard"
        aria-label="Resize window: use arrow keys"
        title="Use arrow keys to resize"
        (keydown)="resizeKey($event)"
      >
        ⌟
      </button>
    }
  `,
})
export class AtlasWindow implements OnInit {
  readonly task = input.required<WorkspaceTask>();
  readonly layer = input(1);
  readonly ws = inject(WorkspaceService);
  private readonly parent = inject(Injector);
  private readonly element = inject(ElementRef<HTMLElement>);
  taskInjector!: Injector;
  readonly edges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  private drag: {
    x: number;
    y: number;
    bounds: WindowBounds;
    edge: string;
  } | null = null;
  ngOnInit() {
    this.taskInjector = Injector.create({
      providers: [{ provide: ATLAS_TASK, useValue: this.task() }],
      parent: this.parent,
    });
  }
  activate() {
    if (this.ws.activeId() !== this.task().id) this.ws.activate(this.task().id);
  }
  saveShortcut(event: Event) {
    // Editors can handle their own validation/permissions first. The fallback
    // also covers initial window focus and title-bar controls.
    const task = this.task();
    if (event.defaultPrevented || this.ws.pendingClose() || this.ws.activeId() !== task.id || !task.lifecycle.save) return;
    event.preventDefault();
    void this.ws.save(task.id);
  }
  maximize(event: MouseEvent) {
    if (!this.ws.mobile() && !(event.target as HTMLElement).closest("button"))
      this.ws.toggleMaximize(this.task().id);
  }
  start(event: PointerEvent, edge: string) {
    if (
      this.ws.mobile() ||
      this.task().mode === "maximized" ||
      event.button !== 0 ||
      (edge === "move" && (event.target as HTMLElement).closest("button"))
    )
      return;
    event.preventDefault();
    this.activate();
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      bounds: { ...this.task().bounds },
      edge,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  move(event: PointerEvent) {
    if (!this.drag) return;
    const { x, y, bounds: b, edge } = this.drag;
    const dx = event.clientX - x,
      dy = event.clientY - y;
    const next = { ...b };
    if (edge === "move") {
      next.x += dx;
      next.y += dy;
    } else {
      if (edge.includes("e")) next.width += dx;
      if (edge.includes("s")) next.height += dy;
      if (edge.includes("w")) {
        const delta = Math.min(dx, b.width - 340);
        next.x += delta;
        next.width -= delta;
      }
      if (edge.includes("n")) {
        const delta = Math.min(dy, b.height - 250);
        next.y += delta;
        next.height -= delta;
      }
    }
    this.ws.move(this.task().id, next);
  }
  end(event: PointerEvent) {
    this.drag = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
  }
  resizeKey(event: KeyboardEvent) {
    const changes: Record<string, [number, number]> = {
      ArrowRight: [20, 0],
      ArrowLeft: [-20, 0],
      ArrowDown: [0, 20],
      ArrowUp: [0, -20],
    };
    const change = changes[event.key];
    if (change) {
      event.preventDefault();
      this.ws.move(this.task().id, {
        ...this.task().bounds,
        width: this.task().bounds.width + change[0],
        height: this.task().bounds.height + change[1],
      });
    }
  }
  moveKey(event: KeyboardEvent) {
    if (
      event.target !== event.currentTarget ||
      this.ws.mobile() ||
      this.task().mode !== "floating"
    )
      return;
    const changes: Record<string, [number, number]> = {
      ArrowRight: [20, 0],
      ArrowLeft: [-20, 0],
      ArrowDown: [0, 20],
      ArrowUp: [0, -20],
    };
    const change = changes[event.key];
    if (change) {
      event.preventDefault();
      this.ws.move(this.task().id, {
        ...this.task().bounds,
        x: this.task().bounds.x + change[0],
        y: this.task().bounds.y + change[1],
      });
    }
  }
}
