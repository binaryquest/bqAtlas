import { signal } from "@angular/core";
import type { RecordResult, RecordCapabilities } from "@bqatlas/contracts";
/** Each editor owns one draft; saved values never share mutable references with the draft. */
export class RecordDraft<T extends object> {
  readonly value = signal<T>({} as T);
  readonly version = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly capabilities = signal<RecordCapabilities | null>(null);
  private saved?: T;
  accept(result: RecordResult<T>) {
    this.capabilities.set(result.capabilities ?? null);
    this.saved = structuredClone(result.data);
    this.value.set(structuredClone(result.data));
    this.version.set(result.version);
    this.dirty.set(false);
  }
  initialize(value: T) {
    this.capabilities.set(null);
    this.saved = undefined;
    this.value.set(structuredClone(value));
    this.version.set(null);
    this.dirty.set(true);
  }
  change<K extends keyof T>(key: K, value: T[K]) {
    this.value.update((current) => ({ ...current, [key]: value }));
    this.dirty.set(true);
  }
  revert() {
    if (this.saved) {
      this.value.set(structuredClone(this.saved));
      this.dirty.set(false);
    }
  }
}
