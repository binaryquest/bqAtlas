import {
  Injectable,
  InjectionToken,
  Type,
  WritableSignal,
  computed,
  signal,
} from "@angular/core";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ScreenDefinition {
  id: string;
  title: string;
  icon: string;
  component: Type<unknown>;
  instance: "singleton" | "keyed" | "multiple";
  width?: number;
  height?: number;
}
export interface OpenTask<T = unknown> {
  screen: string;
  key?: string;
  title?: string;
  data: T;
  origin?: string;
}
export interface WorkspaceTask<T = unknown> {
  id: string;
  screen: string;
  key?: string;
  title: string;
  icon: string;
  component: Type<unknown>;
  data: WritableSignal<T>;
  dirty: WritableSignal<boolean>;
  saving: WritableSignal<boolean>;
  error: WritableSignal<string>;
  bounds: WindowBounds;
  mode: "floating" | "maximized";
  minimized: boolean;
  origin?: string;
  lifecycle: { save?: () => Promise<void>; dispose?: () => void };
}
export const ATLAS_TASK = new InjectionToken<WorkspaceTask>("ATLAS_TASK");

/** Presentation-independent task identity and lifecycle. No ERP or HTTP dependencies. */
@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private readonly definitions = new Map<string, ScreenDefinition>();
  private sequence = 0;
  readonly tasks = signal<WorkspaceTask[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly stackOrder = signal<string[]>([]);
  readonly pendingClose = signal<string | null>(null);
  private closeQueue: string[] = [];
  readonly closingAll = signal(false);
  readonly hasPendingWork = computed(() => this.tasks().some(task => task.dirty() || task.saving()));
  readonly active = computed(
    () => this.tasks().find((t) => t.id === this.activeId()) ?? null,
  );
  readonly closing = computed(
    () => this.tasks().find((t) => t.id === this.pendingClose()) ?? null,
  );
  readonly viewport = signal({ width: 1100, height: 690 });
  readonly mobile = signal(false);
  readonly history: string[] = [];

  register(...definitions: ScreenDefinition[]) {
    for (const def of definitions) {
      if (this.definitions.has(def.id))
        throw new Error(`Screen already registered: ${def.id}`);
      this.definitions.set(def.id, def);
    }
  }
  open<T>(request: OpenTask<T>): WorkspaceTask<T> {
    const def = this.definitions.get(request.screen);
    if (!def) throw new Error(`Unknown screen: ${request.screen}`);
    if (def.instance === "keyed" && !request.key)
      throw new Error(`Screen ${def.id} requires a key`);
    const existing = this.tasks().find(
      (t) =>
        t.screen === def.id &&
        (def.instance === "singleton" ||
          (def.instance === "keyed" && t.key === request.key)),
    );
    if (existing) {
      this.activate(existing.id);
      return this.tasks().find((t) => t.id === existing.id) as WorkspaceTask<T>;
    }
    const offset = (this.tasks().length % 6) * 28;
    const task: WorkspaceTask<T> = {
      id: `task-${++this.sequence}`,
      screen: def.id,
      key: request.key,
      title: request.title ?? def.title,
      icon: def.icon,
      component: def.component,
      data: signal(request.data),
      dirty: signal(false),
      saving: signal(false),
      error: signal(""),
      bounds: this.clamp({
        x: 32 + offset,
        y: 30 + offset,
        width: def.width ?? 780,
        height: def.height ?? 530,
      }),
      mode: "floating",
      minimized: false,
      origin: request.origin,
      lifecycle: {},
    };
    this.tasks.update((tasks) => [...tasks, task as WorkspaceTask]);
    this.activate(task.id);
    return this.tasks().find((t) => t.id === task.id) as WorkspaceTask<T>;
  }
  activate(id: string) {
    const task = this.tasks().find((t) => t.id === id);
    if (!task) return;
    const previous = this.activeId();
    if (previous && previous !== id) {
      this.history.push(previous);
      if (this.history.length > 100) this.history.shift();
    }
    this.patch(id, { minimized: false });
    this.stackOrder.update((ids) => [...ids.filter((item) => item !== id), id]);
    this.activeId.set(id);
  }
  minimize(id: string) {
    this.patch(id, { minimized: true });
    if (this.activeId() === id) this.activeId.set(this.topVisible());
  }
  toggleMaximize(id: string) {
    const task = this.tasks().find((t) => t.id === id);
    if (task) {
      this.patch(id, {
        mode: task.mode === "floating" ? "maximized" : "floating",
      });
      this.activate(id);
    }
  }
  move(id: string, bounds: WindowBounds) {
    this.patch(id, { bounds: this.clamp(bounds), mode: "floating" });
  }
  snap(id: string, side: "left" | "right") {
    const { width, height } = this.viewport();
    this.move(id, {
      x: side === "left" ? 8 : width / 2 + 4,
      y: 8,
      width: width / 2 - 12,
      height: height - 16,
    });
  }
  setViewport(width: number, height: number, mobile: boolean) {
    this.mobile.set(mobile);
    if (mobile) return;
    this.viewport.set({ width, height });
    this.tasks.update((tasks) =>
      tasks.map((task) => ({ ...task, bounds: this.clamp(task.bounds) })),
    );
  }
  clamp(bounds: WindowBounds): WindowBounds {
    const viewport = this.viewport();
    const width = Math.min(
      Math.max(340, bounds.width),
      Math.max(100, viewport.width - 16),
    );
    const height = Math.min(
      Math.max(250, bounds.height),
      Math.max(100, viewport.height - 16),
    );
    return {
      width,
      height,
      x: Math.max(8, Math.min(bounds.x, viewport.width - width - 8)),
      y: Math.max(8, Math.min(bounds.y, viewport.height - height - 8)),
    };
  }
  /** Close a snapshot sequentially through the existing save/discard/cancel dialog. */
  requestCloseAll(): boolean {
    if (this.pendingClose() || this.tasks().some(task => task.saving())) return false;
    this.closeQueue = this.tasks().map(task => task.id).reverse();
    this.closingAll.set(true);
    this.advanceCloseAll();
    return true;
  }
  private advanceCloseAll() {
    while (this.closeQueue.length) {
      const id = this.closeQueue.shift()!;
      const task = this.tasks().find(task => task.id === id);
      if (!task) continue;
      if (task.dirty() || task.saving()) {
        this.activate(id); this.pendingClose.set(id); return;
      }
      this.remove(id);
    }
    this.closingAll.set(false);
  }
  async requestClose(id: string) {
    if (this.closingAll()) return;
    const task = this.tasks().find((t) => t.id === id);
    if (!task || task.saving()) return;
    if (task.dirty()) {
      this.activate(id);
      this.pendingClose.set(id);
    } else this.remove(id);
  }
  cancelClose() {
    if (!this.closing()?.saving()) {
      this.pendingClose.set(null); this.closeQueue = []; this.closingAll.set(false);
    }
  }
  discardClose() {
    const task = this.closing();
    if (task && !task.saving()) {
      this.pendingClose.set(null);
      this.remove(task.id);
      if (this.closingAll()) this.advanceCloseAll();
    }
  }
  async save(id: string): Promise<boolean> {
    const task = this.tasks().find((t) => t.id === id);
    if (!task || !task.lifecycle.save || task.saving()) return false;
    task.saving.set(true);
    task.error.set("");
    try {
      await task.lifecycle.save();
      // A sign-out may dispose this task while its provider is still resolving.
      // Presentation updates copy task objects but preserve lifecycle identity.
      if (!this.tasks().some(current => current.id === id && current.lifecycle === task.lifecycle)) return false;
      task.dirty.set(false);
      return true;
    } catch (error) {
      task.error.set(
        error instanceof Error
          ? error.message
          : "Unable to save. Please try again.",
      );
      return false;
    } finally {
      task.saving.set(false);
    }
  }
  async saveAndClose() {
    const task = this.closing();
    if (task && (await this.save(task.id)) && this.pendingClose() === task.id) {
      this.pendingClose.set(null);
      this.remove(task.id);
      if (this.closingAll()) this.advanceCloseAll();
    }
  }
  back() {
    const origin = this.active()?.origin;
    if (origin && this.tasks().some((t) => t.id === origin)) {
      this.activate(origin);
      return;
    }
    // Activation history is for task switching, not navigation. A root task
    // returns home, avoiding an endless Back loop between independent tasks.
    this.activeId.set(null);
  }
  showDesktop() {
    this.activeId.set(null);
  }
  cascade() {
    this.tasks.update((tasks) =>
      tasks.map((task, index) => ({
        ...task,
        mode: "floating",
        minimized: false,
        bounds: this.clamp({
          x: 20 + (index % 7) * 30,
          y: 20 + (index % 7) * 28,
          width: 760,
          height: 510,
        }),
      })),
    );
  }
  /** Discard all retained task state when the authenticated session ends. */
  disposeAll() {
    const tasks = this.tasks();
    this.tasks.set([]); this.stackOrder.set([]); this.activeId.set(null);
    this.pendingClose.set(null); this.history.length = 0;
    this.closeQueue = []; this.closingAll.set(false);
    for (const task of tasks) {
      try { task.lifecycle.dispose?.(); } catch { /* One cleanup failure must not retain other tasks. */ }
    }
  }
  rekey(id: string, key: string) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;
    if (this.tasks().some(t => t.id !== id && t.screen === task.screen && t.key === key))
      throw new Error(`Task already open: ${key}`);
    this.patch(id, { key });
  }
  private topVisible() {
    return (
      [...this.stackOrder()]
        .reverse()
        .find((id) => this.tasks().some((t) => t.id === id && !t.minimized)) ??
      null
    );
  }
  private patch(id: string, patch: Partial<WorkspaceTask>) {
    this.tasks.update((tasks) =>
      tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }
  private remove(id: string) {
    const task = this.tasks().find((t) => t.id === id);
    task?.lifecycle.dispose?.();
    this.tasks.update((tasks) => tasks.filter((t) => t.id !== id));
    this.stackOrder.update((ids) => ids.filter((item) => item !== id));
    for (let i = this.history.length - 1; i >= 0; i--)
      if (this.history[i] === id) this.history.splice(i, 1);
    if (this.activeId() === id) {
      const origin = this.tasks().find((t) => t.id === task?.origin);
      if (origin) this.activate(origin.id);
      else this.activeId.set(this.topVisible());
    }
  }
}
