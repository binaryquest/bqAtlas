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
import { AtlasButton, AtlasInput } from "./primitives";
import { AtlasDialog } from "./workflow-controls";
export type AtlasFeedbackTone = "info" | "success" | "warning" | "danger";
export function atlasProgressValue(
  value: number | null,
  max = 100,
): number | null {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.min(value, Number.isFinite(max) && max > 0 ? max : 100));
}
@Component({
  selector: "atlas-progress",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="atlas-progress">
    <div>
      <span>{{ label() }}</span
      ><span>{{ amount() === null ? "In progress" : percent() + "%" }}</span>
    </div>
    <progress
      [attr.aria-label]="label()"
      [max]="limit()"
      [attr.value]="amount()"
    ></progress>
  </div>`,
})
export class AtlasProgress {
  readonly value = input<number | null>(null);
  readonly max = input(100);
  readonly label = input("Progress");
  readonly limit = computed(() =>
    Number.isFinite(this.max()) && this.max() > 0 ? this.max() : 100,
  );
  readonly amount = computed(() =>
    atlasProgressValue(this.value(), this.limit()),
  );
  readonly percent = computed(() =>
    Math.round(((this.amount() ?? 0) / this.limit()) * 100),
  );
}
@Component({
  selector: "atlas-notice",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="atlas-notice" [attr.data-tone]="tone()">
    <div [attr.role]="urgent() ? 'alert' : 'status'" aria-atomic="true">
      <strong>{{ title() }}</strong>
      <p>{{ message() }}</p>
    </div>
    @if (dismissible()) {
      <button
        atlasButton
        type="button"
        [attr.aria-label]="'Dismiss ' + title()"
        (click)="dismissed.emit()"
      >
        ×
      </button>
    }
  </section>`,
})
export class AtlasNotice {
  readonly title = input.required<string>();
  readonly message = input("");
  readonly tone = input<AtlasFeedbackTone>("info");
  readonly urgent = input(false);
  readonly dismissible = input(false);
  readonly dismissed = output<void>();
}
@Component({
  selector: "atlas-status-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<footer class="atlas-status-bar" [attr.data-tone]="tone()">
    <span role="status" aria-atomic="true">{{ message() }}</span
    ><span class="atlas-status-detail"><ng-content /></span>
  </footer>`,
})
export class AtlasStatusBar {
  readonly message = input("Ready");
  readonly tone = input<AtlasFeedbackTone>("info");
}
@Component({
  selector: "atlas-loading-region",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section
      class="atlas-loading-region"
      [attr.aria-label]="label()"
      [attr.aria-busy]="busy()"
    >
      <div
        [attr.inert]="busy() ? '' : null"
        [class.atlas-loading-content]="busy()"
      >
        <ng-content />
      </div>
      @if (busy()) {
        <div class="atlas-loading-mask" aria-hidden="true">
          <span class="atlas-spinner"></span><strong>{{ message() }}</strong>
        </div>
      }
    </section>
    <span class="atlas-feedback-sr" role="status">{{
      busy() ? message() : ""
    }}</span>`,
})
export class AtlasLoadingRegion {
  readonly busy = input(false);
  readonly label = input("Content");
  readonly message = input("Loading…");
}
export interface AtlasMessageResult {
  action: "accept" | "cancel";
  value: string;
}
export function atlasPromptError(
  value: string,
  required: boolean,
  maxLength: number,
): string {
  if (required && !value.trim()) return "Enter a value to continue.";
  const limit = Number.isFinite(maxLength)
    ? Math.max(1, Math.floor(maxLength))
    : 200;
  if (value.length > limit) return `Use at most ${limit} characters.`;
  return "";
}
let feedbackSequence = 0;
@Component({
  selector: "atlas-message-box",
  imports: [AtlasDialog, AtlasButton, AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <atlas-dialog
    [open]="open()"
    (openChange)="open.set($event)"
    [title]="title()"
    (dismissed)="finish('cancel')"
    ><p>{{ message() }}</p>
    @if (kind() === "prompt") {
      <label class="atlas-prompt-label" [attr.for]="id">{{
        promptLabel()
      }}</label
      ><input
        atlasInput
        autofocus
        [id]="id"
        [value]="value()"
        [attr.aria-invalid]="!!error()"
        [attr.aria-describedby]="error() ? id + '-error' : null"
        (input)="value.set($any($event.target).value); error.set('')"
        (keydown.enter)="$event.preventDefault(); finish('accept')"
      />
      @if (error()) {
        <p [id]="id + '-error'" role="alert" class="atlas-field-error">
          {{ error() }}
        </p>
      }
    }
    <div atlasDialogActions class="atlas-feedback-actions">
      @if (kind() !== "alert") {
        <button
          atlasButton
          type="button"
          data-atlas-cancel
          (click)="finish('cancel')"
        >
          {{ cancelLabel() }}
        </button>
      }
      <button
        atlasButton
        type="button"
        data-atlas-accept
        [variant]="danger() ? 'danger' : 'primary'"
        (click)="finish('accept')"
      >
        {{ acceptLabel() }}
      </button>
    </div></atlas-dialog
  >`,
})
export class AtlasMessageBox {
  readonly open = model(false);
  readonly value = model("");
  readonly kind = input<"alert" | "confirm" | "prompt">("alert");
  readonly title = input.required<string>();
  readonly message = input("");
  readonly promptLabel = input("Value");
  readonly required = input(true);
  readonly maxLength = input(200);
  readonly acceptLabel = input("OK");
  readonly cancelLabel = input("Cancel");
  readonly danger = input(false);
  readonly result = output<AtlasMessageResult>();
  readonly error = signal("");
  readonly id = `atlas-prompt-${++feedbackSequence}`;
  readonly dialog = viewChild(AtlasDialog);
  private completed = true;
  constructor() {
    effect((onCleanup) => {
      if (this.open()) {
        this.completed = false;
        this.error.set("");
        const selector =
          this.kind() === "prompt"
            ? "input"
            : this.kind() === "confirm"
              ? "[data-atlas-cancel]"
              : "[data-atlas-accept]";
        const dialog = this.dialog();
        const frame = requestAnimationFrame(() => {
          const element = dialog?.dialog()?.nativeElement;
          if (
            this.open() &&
            element?.open &&
            element.contains(document.activeElement)
          )
            element.querySelector<HTMLElement>(selector)?.focus();
        });
        onCleanup(() => cancelAnimationFrame(frame));
      }
    });
  }
  finish(action: "accept" | "cancel") {
    if (this.completed) return;
    if (action === "accept" && this.kind() === "prompt") {
      const error = atlasPromptError(
        this.value(),
        this.required(),
        this.maxLength(),
      );
      if (error) {
        this.error.set(error);
        return;
      }
    }
    this.completed = true;
    this.open.set(false);
    this.result.emit({ action, value: this.value() });
  }
}
/** Viewport-clamped placement, flipping above when the lower edge would overflow. */
export function atlasFeedbackPosition(
  anchor: { left: number; top: number; bottom: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const gap = 8;
  return {
    left: Math.max(
      gap,
      Math.min(anchor.left, viewport.width - panel.width - gap),
    ),
    top: Math.max(
      gap,
      Math.min(
        anchor.bottom + gap + panel.height <= viewport.height - gap
          ? anchor.bottom + gap
          : anchor.top - panel.height - gap,
        viewport.height - panel.height - gap,
      ),
    ),
  };
}
@Component({
  selector: "atlas-popover",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:resize)": "close(false)" },
  template: `<button
      #trigger
      atlasButton
      type="button"
      aria-haspopup="dialog"
      [attr.aria-expanded]="opened()"
      [attr.aria-controls]="id"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      {{ label() }}
    </button>
    <div
      #panel
      popover="auto"
      role="dialog"
      tabindex="-1"
      class="atlas-help-popover"
      [id]="id"
      [attr.aria-labelledby]="id + '-title'"
      (toggle)="toggled()"
      (keydown.escape)="
        $event.preventDefault(); $event.stopPropagation(); close(true)
      "
    >
      <header>
        <strong [id]="id + '-title'">{{ title() }}</strong
        ><button
          atlasButton
          type="button"
          aria-label="Close help"
          (click)="close(true)"
        >
          ×
        </button>
      </header>
      <div><ng-content /></div>
    </div>`,
})
export class AtlasPopover {
  readonly label = input("More information");
  readonly title = input.required<string>();
  readonly disabled = input(false);
  readonly opened = signal(false);
  readonly id = `atlas-popover-${++feedbackSequence}`;
  readonly panel = viewChild<ElementRef<HTMLElement>>("panel");
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const onScroll = (event: Event) => {
        if (
          this.opened() &&
          !this.panel()?.nativeElement.contains(event.target as Node)
        )
          this.close(false);
      };
      document.addEventListener("scroll", onScroll, true);
      destroy.onDestroy(() =>
        document.removeEventListener("scroll", onScroll, true),
      );
    });
    effect(() => {
      if (this.disabled()) this.close(false);
    });
  }
  toggle() {
    if (this.disabled()) return;
    const panel = this.panel()?.nativeElement,
      trigger = this.trigger()?.nativeElement;
    if (!panel || !trigger) return;
    if (panel.matches(":popover-open")) {
      this.close(true);
      return;
    }
    panel.showPopover();
    const at = atlasFeedbackPosition(
      trigger.getBoundingClientRect(),
      panel.getBoundingClientRect(),
      { width: innerWidth, height: innerHeight },
    );
    panel.style.left = `${at.left}px`;
    panel.style.top = `${at.top}px`;
    this.opened.set(true);
    panel.focus({ preventScroll: true });
  }
  close(restore = true) {
    const panel = this.panel()?.nativeElement;
    if (!panel?.matches(":popover-open")) return;
    panel.hidePopover();
    this.opened.set(false);
    if (restore) this.trigger()?.nativeElement.focus({ preventScroll: true });
  }
  toggled() {
    this.opened.set(
      this.panel()?.nativeElement.matches(":popover-open") ?? false,
    );
  }
}
/** Text-only help. Focus or hover opens; Escape dismisses without moving focus. */
@Component({
  selector: "atlas-tooltip",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:resize)": "hide()", "(document:keydown.escape)": "hide()" },
  template: `<button
      #trigger
      atlasButton
      type="button"
      class="atlas-help-trigger"
      [attr.aria-label]="label()"
      [attr.aria-describedby]="id"
      (focus)="show()"
      (blur)="deferHide()"
      (mouseenter)="show()"
      (mouseleave)="deferHide()"
      (click)="show()"
    >
      ?
    </button>
    <div
      #tip
      popover="manual"
      role="tooltip"
      class="atlas-tooltip"
      [id]="id"
      (mouseenter)="stay()"
      (mouseleave)="deferHide()"
    >
      {{ text() }}
    </div>`,
})
export class AtlasTooltip {
  readonly label = input("Help");
  readonly text = input.required<string>();
  readonly id = `atlas-tooltip-${++feedbackSequence}`;
  readonly tip = viewChild<ElementRef<HTMLElement>>("tip");
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const onScroll = () => this.hide();
      document.addEventListener("scroll", onScroll, true);
      destroy.onDestroy(() =>
        document.removeEventListener("scroll", onScroll, true),
      );
    });
    destroy.onDestroy(() => clearTimeout(this.timer));
  }
  stay() {
    clearTimeout(this.timer);
  }
  show() {
    this.stay();
    const tip = this.tip()?.nativeElement,
      trigger = this.trigger()?.nativeElement;
    if (!tip || !trigger) return;
    if (!tip.matches(":popover-open")) tip.showPopover();
    const at = atlasFeedbackPosition(
      trigger.getBoundingClientRect(),
      tip.getBoundingClientRect(),
      { width: innerWidth, height: innerHeight },
    );
    tip.style.left = `${at.left}px`;
    tip.style.top = `${at.top}px`;
  }
  deferHide() {
    this.stay();
    this.timer = setTimeout(() => {
      if (document.activeElement !== this.trigger()?.nativeElement) this.hide();
    }, 150);
  }
  hide() {
    this.stay();
    const tip = this.tip()?.nativeElement;
    if (tip?.matches(":popover-open")) tip.hidePopover();
  }
}
