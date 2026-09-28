import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { AtlasButton, AtlasIcon } from "./primitives";
import {
  AtlasCommand,
  atlasVisibleCommands,
  atlasCommandAllowed,
  atlasToolbarCapacity,
} from "./command-model";
import { AtlasPopupMenu } from "./command-menu";
export type { AtlasCommand } from "./command-model";
@Component({
  selector: "atlas-command-toolbar",
  imports: [AtlasButton, AtlasIcon, AtlasPopupMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
      #bar
      class="atlas-command-toolbar"
      role="toolbar"
      [attr.aria-label]="label()"
    >
      @for (item of visible(); track item.id) {
        <button
          atlasButton
          type="button"
          [variant]="item.primary ? 'primary' : 'secondary'"
          [disabled]="disabled() || item.disabled"
          [class.atlas-command-group-start]="
            $index > 0 && item.group !== visible()[$index - 1].group
          "
          [attr.tabindex]="tabstop() === item.id ? 0 : -1"
          (focus)="focused.set(item.id)"
          (keydown)="key($event)"
          (click)="execute(item)"
        >
          @if (item.icon) {
            <atlas-icon [name]="item.icon" />
          }
          {{ item.label }}
        </button>
      }
      @if (overflow().length) {
        <button
          #more
          atlasButton
          type="button"
          aria-haspopup="menu"
          [attr.aria-expanded]="menu.opened()"
          [disabled]="disabled()"
          [attr.tabindex]="tabstop() === '__more' ? 0 : -1"
          (focus)="focused.set('__more')"
          (keydown)="key($event)"
          (keydown.arrowdown)="$event.preventDefault(); menu.openAt(more)"
          (click)="menu.openAt(more)"
        >
          More ▾
        </button>
      }
      <span #status class="atlas-command-status" role="status"
        ><ng-content
      /></span>
      <atlas-popup-menu
        #menu
        [commands]="overflow()"
        [permissions]="permissions()"
        [disabled]="disabled()"
        [label]="label() + ' overflow'"
        (command)="executeId($event)"
      />
    </div>
    <div #measure class="atlas-toolbar-measure" aria-hidden="true" inert>
      @for (item of allowed(); track item.id) {
        <button
          atlasButton
          tabindex="-1"
          [class.atlas-command-group-start]="
            $index > 0 && item.group !== allowed()[$index - 1].group
          "
          [variant]="item.primary ? 'primary' : 'secondary'"
        >
          @if (item.icon) {
            <atlas-icon [name]="item.icon" />
          }
          {{ item.label }}
        </button>
      }
      <button atlasButton tabindex="-1">More ▾</button>
    </div>`,
})
export class AtlasCommandToolbar {
  readonly commands = input<readonly AtlasCommand[]>([]);
  readonly permissions = input<readonly string[]>([]);
  readonly label = input("Record actions");
  readonly disabled = input(false);
  readonly command = output<string>();
  readonly focused = signal("");
  readonly capacity = signal(Infinity);
  readonly allowed = computed(() =>
    atlasVisibleCommands(this.commands(), this.permissions()),
  );
  readonly visible = computed(() => this.allowed().slice(0, this.capacity()));
  readonly overflow = computed(() => this.allowed().slice(this.capacity()));
  readonly tabstop = computed(() => {
    const ids = this.visible()
      .filter((item) => !item.disabled)
      .map((item) => item.id);
    if (this.overflow().length) ids.push("__more");
    return ids.includes(this.focused()) ? this.focused() : ids[0];
  });
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>("bar");
  private readonly measure =
    viewChild.required<ElementRef<HTMLElement>>("measure");
  private readonly status =
    viewChild.required<ElementRef<HTMLElement>>("status");
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.bar().nativeElement);
      observer.observe(this.measure().nativeElement);
      observer.observe(this.status().nativeElement);
      destroy.onDestroy(() => observer.disconnect());
      this.resize();
    });
    effect((onCleanup) => {
      this.allowed();
      const frame = requestAnimationFrame(() => this.resize());
      onCleanup(() => cancelAnimationFrame(frame));
    });
  }
  resize() {
    const buttons = [
      ...this.measure().nativeElement.querySelectorAll("button"),
    ];
    const more = buttons.pop()?.getBoundingClientRect().width ?? 84;
    const widths = buttons.map(
      (button) =>
        button.getBoundingClientRect().width +
        parseFloat(getComputedStyle(button).marginLeft) +
        parseFloat(getComputedStyle(button).marginRight),
    );
    const status = this.status().nativeElement;
    const style = getComputedStyle(this.bar().nativeElement);
    const padding =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 8;
    const available =
      this.bar().nativeElement.clientWidth -
      padding -
      (status.textContent?.trim()
        ? status.getBoundingClientRect().width + 8
        : 0);
    const capacity = atlasToolbarCapacity(widths, available, more);
    const active = document.activeElement;
    const moveFocus =
      this.bar().nativeElement.contains(active) && capacity !== this.capacity();
    this.capacity.set(capacity);
    if (moveFocus) {
      const bar = this.bar().nativeElement;
      requestAnimationFrame(() => {
        if (
          bar.isConnected &&
          (document.activeElement === active ||
            document.activeElement === document.body)
        )
          bar.querySelector<HTMLElement>('button[tabindex="0"]')?.focus();
      });
    }
  }
  execute(item: AtlasCommand) {
    this.executeId(item.id);
  }
  executeId(id: string) {
    if (
      atlasCommandAllowed(
        this.commands(),
        id,
        this.permissions(),
        this.disabled(),
      )
    )
      this.command.emit(id);
  }
  key(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [
      ...this.bar().nativeElement.querySelectorAll<HTMLButtonElement>(
        ":scope > button:not(:disabled)",
      ),
    ];
    const at = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
}
@Component({
  selector: "atlas-master-detail",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "atlas-master-detail",
    "[class.is-narrow]": "narrow()",
    "(focusin)": "rememberOrigin($event)",
  },
  template: `<section
      class="atlas-master-pane"
      [hidden]="narrow() && detailOpen()"
      [attr.aria-label]="masterLabel()"
    >
      <ng-content select="[atlasMaster]" />
    </section>
    <section
      class="atlas-detail-pane"
      tabindex="-1"
      [hidden]="narrow() && !detailOpen()"
      [attr.aria-label]="detailLabel()"
    >
      @if (narrow()) {
        <button atlasButton type="button" (click)="back()">
          ← {{ masterLabel() }}
        </button>
      }
      <ng-content select="[atlasDetail]" />
    </section>`,
})
export class AtlasMasterDetail {
  readonly detailOpen = model(false);
  readonly masterLabel = input("Records");
  readonly detailLabel = input("Record details");
  readonly breakpoint = input(680);
  readonly width = signal(1000);
  readonly narrow = computed(() => this.width() < this.breakpoint());
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private origin?: HTMLElement;
  rememberOrigin(event: FocusEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      this.host.nativeElement
        .querySelector(".atlas-master-pane")
        ?.contains(target)
    )
      this.origin = target;
  }
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver((entries) =>
        this.width.set(entries[0].contentRect.width),
      );
      observer.observe(this.host.nativeElement);
      destroy.onDestroy(() => observer.disconnect());
    });
    effect(() => {
      const narrow = this.narrow();
      if (this.detailOpen()) {
        if (narrow)
          requestAnimationFrame(() =>
            this.host.nativeElement
              .querySelector<HTMLElement>(".atlas-detail-pane")
              ?.focus(),
          );
        const active = this.host.nativeElement.ownerDocument.activeElement;
        if (
          active instanceof HTMLElement &&
          this.host.nativeElement
            .querySelector(".atlas-master-pane")
            ?.contains(active)
        )
          this.origin = active;
      }
    });
  }
  back() {
    this.detailOpen.set(false);
    requestAnimationFrame(() => {
      if (this.origin?.isConnected) this.origin.focus();
      else
        this.host.nativeElement
          .querySelector<HTMLElement>(".atlas-master-pane button")
          ?.focus();
    });
  }
}
let dialogSequence = 0;
@Component({
  selector: "atlas-dialog",
  host: { "(window:resize)": "position()" },
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dialog
    #dialog
    class="atlas-dialog"
    [attr.aria-labelledby]="titleId"
    (cancel)="cancel($event)"
    (close)="closed()"
  >
    <header>
      <h2 [id]="titleId">{{ title() }}</h2>
      <button
        atlasButton
        type="button"
        aria-label="Close dialog"
        [disabled]="busy()"
        (click)="dismiss()"
      >
        ×
      </button>
    </header>
    <div class="atlas-dialog-body"><ng-content /></div>
    <footer><ng-content select="[atlasDialogActions]" /></footer>
  </dialog>`,
})
export class AtlasDialog {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly busy = input(false);
  readonly dismissed = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>("dialog");
  readonly titleId = `atlas-dialog-${++dialogSequence}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  position() {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog?.open) return;
    const scope = this.host.nativeElement.closest(".atlas-window");
    if (!scope) return;
    const bounds = scope.getBoundingClientRect();
    const width = Math.max(160, Math.min(520, bounds.width - 24));
    dialog.style.width = `${width}px`;
    dialog.style.maxHeight = `${Math.max(100, bounds.height - 24)}px`;
    dialog.style.margin = "0";
    dialog.style.left = `${bounds.left + (bounds.width - width) / 2}px`;
    dialog.style.top = `${bounds.top + Math.max(12, (bounds.height - dialog.getBoundingClientRect().height) / 2)}px`;
  }
  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.open() && !dialog.open) {
        dialog.showModal();
        this.position();
      } else if (!this.open() && dialog.open) dialog.close();
    });
  }
  dismiss() {
    if (this.busy()) return;
    this.open.set(false);
    this.dismissed.emit();
  }
  cancel(event: Event) {
    event.preventDefault();
    this.dismiss();
  }
  closed() {
    this.open.set(false);
  }
}
