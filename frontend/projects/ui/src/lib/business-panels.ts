import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from "@angular/core";
import { AtlasButton, AtlasInput } from "./primitives";
export type AtlasPropertyValue = string | number | boolean | null;
export interface AtlasProperty {
  key: string;
  label: string;
  group: string;
  type: "text" | "number" | "select" | "boolean";
  readonly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly { value: string; label: string }[];
  hint?: string;
}
@Component({
  selector: "atlas-property-sheet",
  imports: [AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="atlas-property-sheet">
    @for (group of groups(); track group) {
      <fieldset>
        <legend>{{ group }}</legend>
        @for (field of fields(); track field.key) {
          @if (field.group === group) {
            <label class="atlas-property-row"
              ><span>{{ field.label }}</span>
              @if (field.readonly) {
                <output>{{ value()[field.key] }}</output>
              } @else {
                @switch (field.type) {
                  @case ("boolean") {
                    <input
                      type="checkbox"
                      [checked]="value()[field.key]"
                      [disabled]="disabled()"
                      (change)="set(field.key, $any($event.target).checked)"
                    />
                  }
                  @case ("select") {
                    <select
                      atlasInput
                      [disabled]="disabled()"
                      (change)="set(field.key, $any($event.target).value)"
                    >
                      @for (option of field.options; track option.value) {
                        <option
                          [value]="option.value"
                          [selected]="option.value === value()[field.key]"
                        >
                          {{ option.label }}
                        </option>
                      }
                    </select>
                  }
                  @default {
                    <input
                      atlasInput
                      [type]="field.type"
                      [value]="value()[field.key] ?? ''"
                      [min]="field.min ?? null"
                      [max]="field.max ?? null"
                      [step]="field.step ?? 'any'"
                      [disabled]="disabled()"
                      (input)="edit(field, $event)"
                    />
                  }
                }
              }
              @if (field.hint) {
                <small>{{ field.hint }}</small>
              }
            </label>
          }
        }
      </fieldset>
    }
  </div>`,
})
export class AtlasPropertySheet {
  readonly fields = input.required<readonly AtlasProperty[]>();
  readonly value = model<Record<string, AtlasPropertyValue>>({});
  readonly disabled = input(false);
  readonly groups = computed(() => [
    ...new Set(this.fields().map((f) => f.group)),
  ]);
  set(key: string, value: AtlasPropertyValue) {
    if (!this.disabled())
      this.value.update((current) => ({ ...current, [key]: value }));
  }
  edit(field: AtlasProperty, event: Event) {
    const el = event.target as HTMLInputElement;
    this.set(
      field.key,
      field.type === "number"
        ? Number.isFinite(el.valueAsNumber)
          ? el.valueAsNumber
          : null
        : el.value,
    );
  }
}
export interface AtlasTotalLine {
  id: string;
  label: string;
  value: number;
  emphasis?: boolean;
}
@Component({
  selector: "atlas-totals-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dl class="atlas-totals-panel" [attr.aria-label]="label()">
    @for (line of lines(); track line.id) {
      <div [class.atlas-total-emphasis]="line.emphasis">
        <dt>{{ line.label }}</dt>
        <dd>{{ format(line.value) }}</dd>
      </div>
    }
  </dl>`,
})
export class AtlasTotalsPanel {
  readonly lines = input.required<readonly AtlasTotalLine[]>();
  readonly currency = input("USD");
  readonly locale = input("en-US");
  readonly label = input("Totals");
  format(value: number) {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency: this.currency(),
    }).format(value);
  }
}
export interface AtlasActivity {
  id: string;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  kind: string;
}
@Component({
  selector: "atlas-activity-timeline",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ol class="atlas-activity-timeline" [attr.aria-label]="label()">
    @for (event of events(); track event.id) {
      <li>
        <div>
          <strong>{{ event.title }}</strong
          ><span>{{ event.kind }}</span>
        </div>
        <p>{{ event.detail }}</p>
        <small
          >{{ event.actor }} ·
          <time [attr.datetime]="event.timestamp">{{
            date(event.timestamp)
          }}</time></small
        >
      </li>
    } @empty {
      <li>No activity yet.</li>
    }
  </ol>`,
})
export class AtlasActivityTimeline {
  readonly events = input.required<readonly AtlasActivity[]>();
  readonly label = input("Activity");
  date(value: string) {
    const time = new Date(value);
    return Number.isNaN(time.valueOf()) ? value : time.toLocaleString();
  }
}
export interface AtlasAttachment {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
}
@Component({
  selector: "atlas-attachment-list",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="atlas-attachment-list" aria-label="Attachments">
    <label class="atlas-file-picker"
      >Add files<input
        type="file"
        multiple
        [disabled]="disabled()"
        [accept]="accept()"
        (change)="pick($event)"
    /></label>
    <ul>
      @for (file of files(); track file.id) {
        <li>
          <div>
            <strong>{{ file.name }}</strong
            ><small
              >{{ (file.size / 1024).toFixed(1) }} KB · {{ file.status }}</small
            >
            @if (file.status === "uploading") {
              <progress
                max="100"
                [value]="file.progress"
                [attr.aria-label]="'Uploading ' + file.name"
              ></progress>
            }
            @if (file.error) {
              <span role="alert">{{ file.error }}</span>
            }
          </div>
          <div>
            @if (file.status === "ready") {
              <button
                atlasButton
                type="button"
                [disabled]="disabled()"
                (click)="preview.emit(file.id)"
              >
                Preview {{ file.name }}
              </button>
            }
            @if (file.status === "error") {
              <button
                atlasButton
                type="button"
                [disabled]="disabled()"
                (click)="retry.emit(file.id)"
              >
                Retry {{ file.name }}
              </button>
            }
            <button
              atlasButton
              type="button"
              [disabled]="disabled()"
              (click)="remove.emit(file.id)"
            >
              {{ file.status === "uploading" ? "Cancel" : "Remove" }}
              {{ file.name }}
            </button>
          </div>
        </li>
      } @empty {
        <li>No attachments. Choose files to get started.</li>
      }
    </ul>
  </section>`,
})
export class AtlasAttachmentList {
  readonly files = input.required<readonly AtlasAttachment[]>();
  readonly disabled = input(false);
  readonly accept = input("");
  readonly add = output<File[]>();
  readonly preview = output<string>();
  readonly retry = output<string>();
  readonly remove = output<string>();
  pick(event: Event) {
    const el = event.target as HTMLInputElement;
    if (!this.disabled() && el.files?.length)
      this.add.emit(Array.from(el.files));
    el.value = "";
  }
}
