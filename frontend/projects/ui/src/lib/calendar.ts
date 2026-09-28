import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
} from "@angular/core";
import { AtlasButton } from "./primitives";
import { validCalendarDate } from "./entry-model";
export function atlasDate(date: string): Date {
  if (!validCalendarDate(date)) throw new Error("Invalid calendar date.");
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(0);
  result.setUTCFullYear(y, m - 1, d);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
function iso(date: Date): string {
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999)
    throw new Error("Calendar supports years 0001–9999.");
  return `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function atlasShiftDate(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("Days must be an integer.");
  const value = atlasDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}
export function atlasShiftMonth(date: string, months: number): string {
  if (!Number.isInteger(months)) throw new Error("Months must be an integer.");
  const value = atlasDate(date),
    day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const target = value.getUTCMonth();
  value.setUTCDate(day);
  if (value.getUTCMonth() !== target) value.setUTCDate(0);
  return iso(value);
}
export function atlasCalendarDays(
  month: string,
  weekStartsOn: 0 | 1 = 1,
): string[] {
  const first = atlasDate(month + "-01");
  const offset = (first.getUTCDay() - weekStartsOn + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    try {
      return atlasShiftDate(month + "-01", index - offset);
    } catch {
      return "";
    }
  });
}
export interface AtlasCalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  description?: string;
}
export function atlasEventsOn(
  events: readonly AtlasCalendarEvent[],
  date: string,
): AtlasCalendarEvent[] {
  if (!validCalendarDate(date)) return [];
  return events.filter(
    (event) =>
      validCalendarDate(event.date) &&
      (!event.endDate ||
        (validCalendarDate(event.endDate) && event.endDate >= event.date)) &&
      event.date <= date &&
      (event.endDate ?? event.date) >= date,
  );
}
@Component({
  selector: "atlas-calendar",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atlas-calendar" [attr.aria-label]="label()">
      <header>
        <button
          atlasButton
          type="button"
          aria-label="Previous month"
          [disabled]="!canNavigate(-1)"
          (click)="navigate(-1)"
        >
          ←
        </button>
        <h3 aria-live="polite">{{ heading() }}</h3>
        <button
          atlasButton
          type="button"
          aria-label="Next month"
          [disabled]="!canNavigate(1)"
          (click)="navigate(1)"
        >
          →
        </button>
      </header>
      @if (days().length) {
        <table role="grid" [attr.aria-label]="heading()">
          <thead>
            <tr>
              @for (day of weekdays(); track day) {
                <th scope="col">{{ day }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (week of [0, 1, 2, 3, 4, 5]; track week) {
              <tr>
                @for (
                  day of days().slice(week * 7, week * 7 + 7);
                  track $index
                ) {
                  <td
                    [class.atlas-calendar-outside]="!day.startsWith(month())"
                    [attr.aria-selected]="selectedDate() === day"
                  >
                    <button
                      type="button"
                      [disabled]="!day || disabled()"
                      [attr.data-calendar-date]="day"
                      [attr.tabindex]="tabstop() === day ? 0 : -1"
                      [attr.aria-label]="dayLabel(day)"
                      (click)="choose(day)"
                      (keydown)="key($event, day)"
                    >
                      <strong>{{ day ? +day.slice(-2) : "" }}</strong>
                      @if (on(day).length) {
                        <small
                          >{{ on(day).length }}
                          {{ on(day).length === 1 ? "event" : "events" }}</small
                        >
                      }
                    </button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        <section class="atlas-calendar-agenda" aria-label="Selected day agenda">
          <h4>{{ selectedDate() }} · Agenda</h4>
          @for (event of on(selectedDate()); track event.id) {
            <button
              atlasButton
              type="button"
              [disabled]="disabled()"
              (click)="eventSelected.emit(event)"
            >
              <strong>{{ event.title }}</strong
              ><span>{{ event.description }}</span>
            </button>
          } @empty {
            <p class="atlas-muted">No events for this date.</p>
          }
        </section>
      } @else {
        <p role="alert">Supply a valid month in YYYY-MM format.</p>
      }
    </section>
  `,
})
export class AtlasCalendar {
  private readonly today = new Date();
  private readonly initial = `${this.today.getFullYear()}-${String(this.today.getMonth() + 1).padStart(2, "0")}-${String(this.today.getDate()).padStart(2, "0")}`;
  readonly month = model(this.initial.slice(0, 7));
  readonly selectedDate = model(this.initial);
  readonly events = input<readonly AtlasCalendarEvent[]>([]);
  readonly weekStartsOn = input<0 | 1>(1);
  readonly disabled = input(false);
  readonly label = input("Calendar");
  readonly eventSelected = output<AtlasCalendarEvent>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly days = computed(() => {
    try {
      return atlasCalendarDays(this.month(), this.weekStartsOn());
    } catch {
      return [];
    }
  });
  readonly weekdays = computed(() =>
    this.weekStartsOn() === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  );
  readonly tabstop = computed(() =>
    this.selectedDate().startsWith(this.month()) &&
    this.days().includes(this.selectedDate())
      ? this.selectedDate()
      : this.month() + "-01",
  );
  readonly heading = computed(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(atlasDate(this.month() + "-01"));
    } catch {
      return this.month();
    }
  });
  on(date: string) {
    return atlasEventsOn(this.events(), date);
  }
  dayLabel(date: string) {
    if (!date) return "Outside calendar range";
    return (
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "full",
        timeZone: "UTC",
      }).format(atlasDate(date)) + `, ${this.on(date).length} events`
    );
  }
  canNavigate(delta: number) {
    if (this.disabled()) return false;
    try {
      atlasShiftMonth(this.month() + "-01", delta);
      return true;
    } catch {
      return false;
    }
  }
  navigate(delta: number) {
    if (this.canNavigate(delta))
      this.month.set(atlasShiftMonth(this.month() + "-01", delta).slice(0, 7));
  }
  choose(date: string) {
    if (this.disabled() || !validCalendarDate(date)) return;
    this.selectedDate.set(date);
    this.month.set(date.slice(0, 7));
  }
  key(event: KeyboardEvent, date: string) {
    if (this.disabled()) return;
    let next: string;
    try {
      switch (event.key) {
        case "ArrowLeft":
          next = atlasShiftDate(date, -1);
          break;
        case "ArrowRight":
          next = atlasShiftDate(date, 1);
          break;
        case "ArrowUp":
          next = atlasShiftDate(date, -7);
          break;
        case "ArrowDown":
          next = atlasShiftDate(date, 7);
          break;
        case "Home":
          next = atlasShiftDate(
            date,
            -((atlasDate(date).getUTCDay() - this.weekStartsOn() + 7) % 7),
          );
          break;
        case "End":
          next = atlasShiftDate(
            date,
            6 - ((atlasDate(date).getUTCDay() - this.weekStartsOn() + 7) % 7),
          );
          break;
        case "PageUp":
          next = atlasShiftMonth(date, -1);
          break;
        case "PageDown":
          next = atlasShiftMonth(date, 1);
          break;
        default:
          return;
      }
    } catch {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    this.choose(next);
    const host = this.host.nativeElement;
    requestAnimationFrame(() => {
      if (host.isConnected)
        host
          .querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`)
          ?.focus();
    });
  }
}
