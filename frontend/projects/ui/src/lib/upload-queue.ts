import { signal } from "@angular/core";
import { AtlasAttachment } from "./business-panels";
export type AtlasUploadAdapter = (
  file: File,
  context: { signal: AbortSignal; progress: (percent: number) => void },
) => Promise<void>;
/** Feature-owned upload state. Call destroy() on disposal. Adapter owns HTTP and remote file IDs. */
export class AtlasUploadQueue {
  readonly files = signal<AtlasAttachment[]>([]);
  readonly error = signal("");
  private sources = new Map<string, File>();
  private requests = new Map<string, AbortController>();
  private sequence = 0;
  private disposed = false;
  constructor(
    private adapter: AtlasUploadAdapter,
    private maxBytes = 10 * 1024 * 1024,
  ) {}
  add(files: readonly File[]) {
    if (this.disposed) return;
    this.error.set("");
    for (const file of files) {
      if (file.size > this.maxBytes) {
        this.error.set(
          `${file.name} exceeds the ${this.maxBytes / 1024 / 1024} MB limit.`,
        );
        continue;
      }
      const id = `upload-${++this.sequence}`;
      this.sources.set(id, file);
      this.files.update((rows) => [
        ...rows,
        {
          id,
          name: file.name,
          size: file.size,
          status: "uploading",
          progress: 0,
        },
      ]);
      void this.upload(id);
    }
  }
  file(id: string) {
    return this.sources.get(id) ?? null;
  }
  async upload(id: string) {
    const file = this.sources.get(id);
    if (!file || this.disposed || this.requests.has(id)) return;
    const controller = new AbortController();
    this.requests.set(id, controller);
    const current = () =>
      !this.disposed && this.requests.get(id) === controller;
    this.patch(id, { status: "uploading", progress: 0, error: undefined });
    try {
      await this.adapter(file, {
        signal: controller.signal,
        progress: (percent) => {
          if (current() && Number.isFinite(percent))
            this.patch(id, { progress: Math.max(0, Math.min(100, percent)) });
        },
      });
      if (current()) this.patch(id, { status: "ready", progress: 100 });
    } catch (error) {
      if (current())
        this.patch(id, {
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Upload failed. Retry to continue.",
        });
    } finally {
      if (current()) this.requests.delete(id);
    }
  }
  remove(id: string) {
    const controller = this.requests.get(id);
    this.requests.delete(id);
    controller?.abort();
    this.sources.delete(id);
    this.files.update((rows) => rows.filter((row) => row.id !== id));
  }
  destroy() {
    this.disposed = true;
    this.requests.forEach((c) => c.abort());
    this.requests.clear();
    this.sources.clear();
  }
  private patch(id: string, patch: Partial<AtlasAttachment>) {
    this.files.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
}
