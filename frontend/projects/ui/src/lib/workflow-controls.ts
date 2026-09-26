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
export interface AtlasCommand {
  id: string;
  label: string;
  icon?: string;
  primary?: boolean;
  disabled?: boolean;
  group?: string;
}
@Component({
  selector: "atlas-command-toolbar",
  imports: [AtlasButton, AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="atlas-command-toolbar"
    role="toolbar"
    [attr.aria-label]="label()"
  >
    @for (command of commands(); track command.id) {
      <button
        atlasButton
        type="button"
        [variant]="command.primary ? 'primary' : 'secondary'"
        [disabled]="disabled() || command.disabled"
        [attr.tabindex]="tabstop() === command.id ? 0 : -1"
        [class.atlas-command-group-start]="
          $index > 0 && command.group !== commands()[$index - 1].group
        "
        (focus)="focused.set(command.id)"
        (keydown)="key($event, command.id)"
        (click)="execute(command)"
      >
        @if (command.icon) {
          <atlas-icon [name]="command.icon!" />
        }
        {{ command.label }}
      </button>
    }
    <span class="atlas-command-status" role="status"><ng-content /></span>
  </div>`,
})
export class AtlasCommandToolbar {
  readonly commands = input<AtlasCommand[]>([]);
  readonly label = input("Record actions");
  readonly disabled = input(false);
  readonly command = output<string>();
  readonly focused = signal("");
  readonly available = computed(() =>
    this.disabled() ? [] : this.commands().filter((c) => !c.disabled),
  );
  readonly tabstop = computed(
    () =>
      this.available().find((c) => c.id === this.focused())?.id ??
      this.available()[0]?.id,
  );
  execute(command: AtlasCommand) {
    if (!this.disabled() && !command.disabled) this.command.emit(command.id);
  }
  key(event: KeyboardEvent, id: string) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = this.available(),
      at = items.findIndex((c) => c.id === id);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (at + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
            items.length;
    const buttons = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    buttons?.[next]?.focus();
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
