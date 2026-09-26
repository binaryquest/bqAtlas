import {
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { AtlasIcon } from "./primitives";

export interface AtlasStartItem {
  id: string;
  label: string;
  icon: string;
  separatorBefore?: boolean;
  disabled?: boolean;
}

@Component({
  selector: "atlas-start-menu",
  imports: [AtlasIcon],
  host: { "(window:resize)": "opened() && close()" },
  template: `
    <button
      #trigger
      class="atlas-start-button"
      aria-haspopup="menu"
      [attr.aria-expanded]="opened()"
      [attr.aria-controls]="menuId()"
      (click)="toggle()"
      (keydown.arrowdown)="$event.preventDefault(); open()"
      (keydown.arrowup)="$event.preventDefault(); open(true)"
    >
      <atlas-icon name="grid" />
      <strong>{{ label() }}</strong>
    </button>
    <div
      #popup
      [id]="menuId()"
      popover="auto"
      class="atlas-start-popup"
      (toggle)="opened.set($any($event).newState === 'open')"
      (keydown)="key($event)"
    >
      <div class="atlas-start-heading">
        <strong>{{ label() }}</strong><span>Applications & tools</span>
      </div>
      <div class="atlas-start-items" role="menu" aria-label="Start menu">
        @for (item of items(); track item.id) {
          @if (item.separatorBefore) {
            <div role="separator" class="atlas-start-separator"></div>
          }
          <button role="menuitem" tabindex="-1" [disabled]="item.disabled" (click)="choose(item.id)">
            <atlas-icon [name]="item.icon" /><span>{{ item.label }}</span>
          </button>
        }
      </div>
      @if (accountName()) {
        <section class="atlas-start-account" aria-label="Account">
          <div role="menu" aria-label="User account"><button class="atlas-start-profile" role="menuitem" tabindex="-1" (click)="openAccount()">
            <span class="atlas-start-avatar" aria-hidden="true">{{ accountName().trim().slice(0, 1).toUpperCase() }}</span>
            <span class="atlas-start-identity"><strong>{{ accountName() }}</strong><span>My account</span></span>
          </button></div>
          <div class="atlas-start-items" role="menu" aria-label="Account options">
            @for (item of accountActions(); track item.id) {
              <button role="menuitem" tabindex="-1" [disabled]="item.disabled" (click)="chooseAccount(item.id)">
                <atlas-icon [name]="item.icon" /><span>{{ item.label }}</span>
              </button>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class AtlasStartMenu {
  readonly label = input("Start");
  readonly accountName = input("");
  readonly accountSelected = output<void>();
  openAccount() { this.close(); this.accountSelected.emit(); }
  readonly accountActions = input<AtlasStartItem[]>([]);
  readonly accountActionSelected = output<string>();
  chooseAccount(id: string) {
    if (!this.accountActions().some(item => item.id === id && !item.disabled)) return;
    this.close();
    this.accountActionSelected.emit(id);
  }
  readonly menuId = input.required<string>();
  readonly items = input.required<AtlasStartItem[]>();
  readonly itemSelected = output<string>();
  readonly opened = signal(false);
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>("trigger");
  private readonly popup =
    viewChild.required<ElementRef<HTMLDivElement>>("popup");
  toggle() {
    this.opened() ? this.close() : this.open();
  }
  open(last = false) {
    const popup = this.popup().nativeElement;
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const win = popup.ownerDocument.defaultView!;
    const workspace = this.trigger()
      .nativeElement.closest(".atlas-workspace")
      ?.getBoundingClientRect();
    const left = workspace ? workspace.left + 8 : 4;
    const right = workspace ? workspace.right - 8 : win.innerWidth - 4;
    const width = Math.min(280, right - left);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(left, Math.min(rect.left, right - width))}px`;
    const top = workspace?.top ?? 0;
    const bottom = workspace?.bottom ?? win.innerHeight;
    const below = bottom - rect.bottom - 8;
    const above = rect.top - top - 8;
    const down = below > above;
    popup.style.top = down ? `${rect.bottom + 3}px` : 'auto';
    popup.style.bottom = down ? 'auto' : `${win.innerHeight - rect.top + 3}px`;
    popup.style.maxHeight = `${Math.max(0, down ? below : above)}px`;
    popup.showPopover();
    this.opened.set(true);
    const buttons =
      popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    buttons[last ? buttons.length - 1 : 0]?.focus();
  }
  close() {
    this.popup().nativeElement.hidePopover();
    this.opened.set(false);
    this.trigger().nativeElement.focus();
  }
  choose(id: string) {
    if (!this.items().some(item => item.id === id && !item.disabled)) return;
    this.close();
    this.itemSelected.emit(id);
  }
  key(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      this.close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const popup = this.popup().nativeElement;
    const buttons = Array.from(
      popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    const current = buttons.indexOf(
      popup.ownerDocument.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
}
