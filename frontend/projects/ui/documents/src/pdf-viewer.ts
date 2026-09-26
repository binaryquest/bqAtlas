import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  signal,
  viewChild,
} from "@angular/core";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { AtlasButton } from "@bqatlas/ui";
@Component({
  selector: "atlas-pdf-viewer",
  imports: [AtlasButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="atlas-pdf-toolbar">
      <button
        atlasButton
        [disabled]="page() <= 1"
        (click)="page.update(p=>p-1)"
      >
        Previous page</button
      ><span>Page {{ page() }} of {{ document()?.numPages || 0 }}</span
      ><button
        atlasButton
        [disabled]="page() >= (document()?.numPages || 0)"
        (click)="page.update(p=>p+1)"
      >
        Next page</button
      ><button
        atlasButton
        [disabled]="scale() <= 0.5"
        (click)="scale.update(s=>s-0.25)"
      >
        PDF zoom out</button
      ><span>{{ scale() * 100 }}%</span
      ><button
        atlasButton
        [disabled]="scale() >= 2"
        (click)="scale.update(s=>s+0.25)"
      >
        PDF zoom in
      </button>
    </div>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Rendering PDF…</p>
    }
    <div class="atlas-pdf-canvas-stage">
      <canvas
        #canvas
        role="img"
        [attr.aria-label]="'PDF page ' + page()"
      ></canvas>
    </div>
    <details>
      <summary>Page text</summary>
      <pre class="atlas-text-stage">{{ pageText() }}</pre>
    </details>`,
})
export class AtlasPdfViewer {
  readonly file = input.required<File>();
  readonly workerSrc = input("assets/pdfjs/pdf.worker.min.mjs");
  readonly document = signal<PDFDocumentProxy | null>(null);
  readonly page = signal(1);
  readonly scale = signal(1);
  readonly error = signal("");
  readonly loading = signal(false);
  readonly pageText = signal("");
  private canvas = viewChild<ElementRef<HTMLCanvasElement>>("canvas");
  constructor() {
    effect((onCleanup) => {
      const file = this.file(),
        worker = this.workerSrc();
      let active = true;
      let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
      this.document.set(null);
      this.page.set(1);
      this.scale.set(1);
      this.error.set("");
      this.loading.set(true);
      void (async () => {
        try {
          const pdf = await import("pdfjs-dist");
          if (!active) return;
          pdf.GlobalWorkerOptions.workerSrc = new URL(worker, globalThis.location.href).href;
          const data = await file.arrayBuffer();
          if (!active) return;
          task = pdf.getDocument({ data, standardFontDataUrl: worker.slice(0, worker.lastIndexOf("/")+1) + "standard_fonts/" });
          const doc = await task.promise;
          if (active) this.document.set(doc);
        } catch {
          if (active) {
            this.loading.set(false);
            this.error.set(
              "Unable to open PDF. It may be corrupt or password-protected. You can download the original.",
            );
          }
        }
      })();
      onCleanup(() => {
        active = false;
        void task?.destroy();
      });
    });
    effect((onCleanup) => {
      const doc = this.document(),
        page = this.page(),
        scale = this.scale(),
        canvas = this.canvas()?.nativeElement;
      if (!doc || !canvas) return;
      let active = true;
      let render: RenderTask | undefined;
      this.loading.set(true);
      this.error.set("");
      this.pageText.set("");
      void (async () => {
        try {
          const pdfPage = await doc.getPage(page);
          if (!active) return;
          let viewport = pdfPage.getViewport({ scale });
          if (Math.max(viewport.width, viewport.height) > 4096)
            viewport = pdfPage.getViewport({
              scale: (scale * 4096) / Math.max(viewport.width, viewport.height),
            });
          const scratch = canvas.ownerDocument.createElement("canvas");
          scratch.width = viewport.width;
          scratch.height = viewport.height;
          render = pdfPage.render({ canvas: scratch, viewport });
          await render.promise;
          if (!active) return;
          canvas.width = scratch.width;
          canvas.height = scratch.height;
          canvas.getContext("2d")!.drawImage(scratch, 0, 0);
          const text = await pdfPage.getTextContent();
          if (active)
            this.pageText.set(
              text.items
                .map((item) => ("str" in item ? item.str : ""))
                .join(" "),
            );
        } catch {
          if (active)
            this.error.set(
              "Unable to render this page. Try another page or download the original.",
            );
        } finally {
          if (active) this.loading.set(false);
        }
      })();
      onCleanup(() => {
        active = false;
        render?.cancel();
      });
    });
  }
}
