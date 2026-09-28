import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { AtlasButton, AtlasIcon } from "./primitives";
import {
  AtlasCommand,
  atlasVisibleCommands,
  atlasCommandAllowed,
} from "./command-model";

@Component({
  selector: "atlas-popup-menu",
  host: { "(window:resize)": "viewportChanged()" },
  imports: [AtlasIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    #panel
    popover="auto"
    class="atlas-popup-menu"
    role="menu"
    tabindex="-1"
    [attr.aria-label]="label()"
    (toggle)="toggled($event)"
    (keydown)="key($event)"
  >
    @for (item of visible(); track item.id) {
      @if ($index > 0 && item.group !== visible()[$index - 1].group) {
        <div role="separator" class="atlas-menu-separator"></div>
      }
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        [attr.aria-disabled]="disabled() || item.disabled || false"
        (click)="execute(item.id)"
      >
        @if (item.icon) {
          <atlas-icon [name]="item.icon" />
        }
        <span>{{ item.label }}</span>
      </button>
    } @empty {
      <p role="status">No available actions.</p>
    }
  </div>`,
})
export class AtlasPopupMenu {
  readonly commands = input<readonly AtlasCommand[]>([]);
  readonly permissions = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly label = input("Actions");
  readonly command = output<string>();
  readonly opened = signal(false);
  readonly visible = computed(() =>
    atlasVisibleCommands(this.commands(), this.permissions()),
  );
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>("panel");
  private origin?: HTMLElement;
  openAt(origin: HTMLElement, point?: { x: number; y: number }, last = false) {
    if (this.disabled() || !this.visible().length) return;
    this.origin = origin;
    const panel = this.panel().nativeElement;
    panel.showPopover();
    this.opened.set(true);
    const rect = origin.getBoundingClientRect();
    const menu = panel.getBoundingClientRect();
    const x = point?.x ?? rect.left;
    const y = point?.y ?? rect.bottom + 4;
    panel.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.height - 8))}px`;
    const items = panel.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (items[last ? items.length - 1 : 0] ?? panel).focus();
  }
  close(restore = true) {
    this.panel().nativeElement.hidePopover();
    this.opened.set(false);
    if (restore && this.origin?.isConnected) this.origin.focus();
  }
  viewportChanged() {
    if (this.opened()) this.close();
  }
  toggled(event: Event) {
    this.opened.set((event as ToggleEvent).newState === "open");
  }
  execute(id: string) {
    if (
      !atlasCommandAllowed(
        this.commands(),
        id,
        this.permissions(),
        this.disabled(),
      )
    )
      return;
    this.close();
    this.command.emit(id);
  }
  key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === "Tab") {
      this.close();
      return;
    }
    const items = [
      ...this.panel().nativeElement.querySelectorAll<HTMLElement>(
        '[role="menuitem"]',
      ),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = (index + 1) % items.length;
        break;
      case "ArrowUp":
        next = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        if (
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.key === " "
        )
          return;
        next = items.findIndex((_, offset) =>
          items[(index + offset + 1) % items.length]?.textContent
            ?.trim()
            .toLocaleLowerCase()
            .startsWith(event.key.toLocaleLowerCase()),
        );
        if (next < 0) return;
        next = (index + next + 1) % items.length;
    }
    event.preventDefault();
    items[next]?.focus();
  }
}
@Directive({
  selector: "[atlasContextMenu]",
  host: { "(contextmenu)": "open($event)", "(keydown)": "keyboard($event)" },
})
export class AtlasContextMenu {
  readonly atlasContextMenu = input.required<AtlasPopupMenu>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  open(event: MouseEvent) {
    if (
      (event.target as HTMLElement).closest(
        'input,textarea,[contenteditable="true"]',
      )
    )
      return;
    if (
      this.atlasContextMenu().disabled() ||
      !this.atlasContextMenu().visible().length
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.atlasContextMenu().openAt(this.host.nativeElement, {
      x: event.clientX,
      y: event.clientY,
    });
  }
  keyboard(event: KeyboardEvent) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
      return;
    event.preventDefault();
    event.stopPropagation();
    this.atlasContextMenu().openAt(this.host.nativeElement);
  }
}
@Component({
  selector: "atlas-menu-button",
  imports: [AtlasButton, AtlasPopupMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
      #trigger
      atlasButton
      type="button"
      aria-haspopup="menu"
      [attr.aria-expanded]="menu.opened()"
      [disabled]="disabled() || !menu.visible().length"
      (click)="menu.opened() ? menu.close() : menu.openAt(trigger)"
      (keydown.arrowdown)="$event.preventDefault(); menu.openAt(trigger)"
      (keydown.arrowup)="
        $event.preventDefault(); menu.openAt(trigger, undefined, true)
      "
    >
      {{ label() }} ▾
    </button>
    <atlas-popup-menu
      #menu
      [commands]="commands()"
      [permissions]="permissions()"
      [disabled]="disabled()"
      [label]="label()"
      (command)="command.emit($event)"
    />`,
})
export class AtlasMenuButton {
  readonly commands = input<readonly AtlasCommand[]>([]);
  readonly permissions = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly label = input("Actions");
  readonly command = output<string>();
}
@Component({
  selector: "atlas-split-button",
  imports: [AtlasButton, AtlasPopupMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="atlas-split-button"
    role="group"
    [attr.aria-label]="label()"
  >
    @if (primary(); as action) {
      <button
        #main
        atlasButton
        type="button"
        [variant]="action.primary ? 'primary' : 'secondary'"
        [disabled]="disabled() || action.disabled"
        (click)="execute(action.id)"
        (keydown.arrowdown)="$event.preventDefault(); menu.openAt(main)"
      >
        {{ action.label }}
      </button>
    }
    <button
      #trigger
      atlasButton
      type="button"
      aria-haspopup="menu"
      [attr.aria-label]="label() + ' alternatives'"
      [attr.aria-expanded]="menu.opened()"
      [disabled]="disabled() || !alternatives().length"
      (click)="menu.opened() ? menu.close() : menu.openAt(trigger)"
      (keydown.arrowdown)="$event.preventDefault(); menu.openAt(trigger)"
    >
      ▾
    </button>
    <atlas-popup-menu
      #menu
      [commands]="alternatives()"
      [permissions]="permissions()"
      [disabled]="disabled()"
      [label]="label()"
      (command)="execute($event)"
    />
  </div>`,
})
export class AtlasSplitButton {
  readonly commands = input<readonly AtlasCommand[]>([]);
  readonly primaryId = input.required<string>();
  readonly permissions = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly label = input("Save options");
  readonly command = output<string>();
  readonly primary = computed(() =>
    atlasVisibleCommands(this.commands(), this.permissions()).find(
      (command) => command.id === this.primaryId(),
    ),
  );
  readonly alternatives = computed(() =>
    atlasVisibleCommands(this.commands(), this.permissions()).filter(
      (command) => command.id !== this.primaryId(),
    ),
  );
  execute(id: string) {
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
}
