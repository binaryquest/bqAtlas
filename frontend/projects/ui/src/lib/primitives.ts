import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  input,
} from "@angular/core";

@Component({
  selector: "atlas-icon",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[name()] || paths['grid']" />
  </svg>`,
  styles: [
    ":host{display:inline-flex;width:18px;height:18px;flex-shrink:0}svg{width:100%;height:100%}",
  ],
})
export class AtlasIcon {
  name = input("grid");
  readonly paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    layers: "m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
    window: "M3 4h18v16H3z M3 9h18 M6 6.5h.1 M9 6.5h.1",
    orders: "M7 3h10v3h3v15H4V6h3z M7 3v5h10V3 M8 12h8 M8 16h5",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
    box: "m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5l10 5",
    plus: "M12 5v14 M5 12h14",
    close: "M6 6l12 12 M18 6 6 18",
    minimize: "M5 17h14",
    maximize: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
    restore: "M8 8h12v12H8z M4 16V4h12",
    search: "M21 21l-5-5 M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15",
    chevron: "m9 5 7 7-7 7",
    down: "m6 9 6 6 6-6",
    back: "m14 5-7 7 7 7 M7 12h14",
    check: "m5 12 4 4L19 6",
    settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    code: "m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
    monitor: "M3 3h18v13H3z M8 21h8 M12 16v5",
    phone: "M7 2h10v20H7z M11 18h2",
    moon: "M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
    arrow: "M5 12h14 m-5-5 5 5-5 5",
    refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12",
    save: "M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-8h10v8",
    mail: "M3 5h18v14H3z m0 0 9 7 9-7",
    activity: "M2 12h5l3-8 4 16 3-8h5",
    book: "M12 5C8 2 3 3 3 3v17s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2z M12 5v17",
    bolt: "m13 2-9 12h7l-1 8 10-12h-7z",
    filter: "M3 5h18l-7 8v7l-4-2v-5z",
    left: "M3 4h18v16H3z M12 4v16 M6 8h3 M6 12h3",
    right: "M3 4h18v16H3z M12 4v16 M15 8h3 M15 12h3",
  };
}

@Directive({
  selector: "button[atlasButton], a[atlasButton]",
  host: { class: "atlas-button", "[attr.data-variant]": "variant()" },
})
export class AtlasButton {
  variant = input<"primary" | "secondary" | "ghost" | "danger">("secondary");
}

@Directive({
  selector: "input[atlasInput], textarea[atlasInput], select[atlasInput]",
  host: { class: "atlas-input" },
})
export class AtlasInput {}

@Component({
  selector: "atlas-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-badge", "[attr.data-tone]": "tone()" },
  template: "<ng-content />",
})
export class AtlasBadge {
  tone = input<"neutral" | "success" | "warning" | "info" | "danger">(
    "neutral",
  );
}

@Component({
  selector: "atlas-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-panel" },
  template: `@if (title()) {
      <header class="atlas-panel-header">
        <h3>{{ title() }}</h3>
        <ng-content select="[panelActions]" />
      </header>
    }
    <div class="atlas-panel-body"><ng-content /></div>`,
})
export class AtlasPanel {
  title = input("");
}

@Component({
  selector: "atlas-field",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "atlas-field" },
  template: `<label [attr.for]="controlId()"
      >{{ label() }}
      @if (required()) {
        <span aria-hidden="true">*</span>
      }</label
    ><ng-content />
    @if (error()) {
      <small
        class="atlas-field-error"
        [id]="controlId() + '-error'"
        role="alert"
        >{{ error() }}</small
      >
    } @else if (hint()) {
      <small [id]="controlId() + '-hint'">{{ hint() }}</small>
    }`,
})
export class AtlasField {
  label = input.required<string>();
  controlId = input.required<string>();
  required = input(false);
  hint = input("");
  error = input("");
}
