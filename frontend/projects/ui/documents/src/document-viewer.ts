import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  viewChild,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { AtlasPdfViewer } from "./pdf-viewer";
import { AtlasButton } from "@bqatlas/ui";
export function documentKind(
  file: Pick<File, "name" | "type">,
): "image" | "pdf" | "text" | "unsupported" {
  if (
    [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/avif",
    ].includes(file.type)
  )
    return "image";
  if (
    file.type === "application/pdf" ||
    (!file.type && /\.pdf$/i.test(file.name))
  )
    return "pdf";
  if (file.type.startsWith("text/") || /\.(txt|csv|md|json)$/i.test(file.name))
    return "text";
  return "unsupported";
}
@Component({
  selector: "atlas-document-viewer",
  imports: [AtlasButton, AtlasPdfViewer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section
    class="atlas-document-viewer"
    aria-label="Document viewer"
  >
    @if (file(); as file) {
      <header>
        <strong>{{ file.name }}</strong
        ><span>{{ (file.size / 1024).toFixed(1) }} KB</span
        ><a atlasButton [href]="url()" [download]="file.name"
          >Download original</a
        >
        @if (kind() === "image") {
          <button
            atlasButton
            (click)="zoom.set(Math.max(25, zoom() - 25))"
            [disabled]="zoom() <= 25"
          >
            Zoom out</button
          ><span>{{ zoom() }}%</span
          ><button
            atlasButton
            (click)="zoom.set(Math.min(300, zoom() + 25))"
            [disabled]="zoom() >= 300"
          >
            Zoom in</button
          ><button atlasButton (click)="rotation.set((rotation() + 90) % 360)">
            Rotate</button
          ><button atlasButton (click)="zoom.set(100); rotation.set(0)">
            Reset view
          </button>
        }
      </header>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @switch (kind()) {
        @case ("image") {
          <div #stage class="atlas-image-stage">
            <div
              class="atlas-image-layout"
              [style.width.px]="rotation() % 180 ? imageHeight() : imageWidth()"
              [style.height.px]="
                rotation() % 180 ? imageWidth() : imageHeight()
              "
            >
              <img
                (load)="imageLoaded($event)"
                [src]="url()"
                [alt]="file.name"
                [style.width.px]="imageWidth()"
                [style.transform]="
                  'translate(-50%, -50%) rotate(' + rotation() + 'deg)'
                "
                (error)="
                  error.set(
                    'This image could not be decoded. Download the original to inspect it.'
                  )
                "
              />
            </div>
          </div>
        }
        @case ("pdf") {
          <atlas-pdf-viewer [file]="file" [workerSrc]="pdfWorkerSrc()" />
        }
        @case ("text") {
          <pre class="atlas-text-stage">{{ text() }}</pre>
        }
        @default {
          <p>
            Preview is unavailable for this file type. Download the original to
            open it in a suitable application.
          </p>
        }
      }
    } @else {
      <p>Select a ready attachment to preview it.</p>
    }
  </section>`,
})
export class AtlasDocumentViewer {
  readonly file = input<File | null>(null);
  readonly kind = signal<"image" | "pdf" | "text" | "unsupported">(
    "unsupported",
  );
  readonly url = signal("");
  readonly pdfWorkerSrc = input("assets/pdfjs/pdf.worker.min.mjs");
  readonly text = signal("");
  readonly error = signal("");
  readonly zoom = signal(100);
  readonly rotation = signal(0);
  readonly Math = Math;
  private stage = viewChild<ElementRef<HTMLElement>>("stage");
  readonly stageWidth = signal(600);
  readonly ratio = signal(0.65);
  readonly imageWidth = computed(() => (this.stageWidth() * this.zoom()) / 100);
  readonly imageHeight = computed(() => this.imageWidth() * this.ratio());
  imageLoaded(event: Event) {
    const img = event.target as HTMLImageElement;
    this.ratio.set(img.naturalHeight / img.naturalWidth);
  }

  constructor() {
    effect((onCleanup) => {
      const stage = this.stage()?.nativeElement;
      if (!stage) return;
      const observer = new ResizeObserver(() =>
        this.stageWidth.set(Math.max(80, stage.clientWidth - 40)),
      );
      observer.observe(stage);
      onCleanup(() => observer.disconnect());
    });
    effect((onCleanup) => {
      const file = this.file();
      this.error.set("");
      this.text.set("Loading text…");
      this.zoom.set(100);
      this.rotation.set(0);
      if (!file) {
        this.url.set("");
        return;
      }
      const url = URL.createObjectURL(file);
      let active = true;
      this.url.set(url);
      const kind = documentKind(file);
      this.kind.set(kind);
      if (kind === "text")
        void file
          .slice(0, 100000)
          .text()
          .then((text) => {
            if (active)
              this.text.set(
                text +
                  (file.size > 100000
                    ? "\n\n[Preview truncated to 100 KB]"
                    : ""),
              );
          })
          .catch(() => {
            if (active) this.error.set("Unable to read this file.");
          });
      onCleanup(() => {
        active = false;
        URL.revokeObjectURL(url);
      });
    });
  }
}
