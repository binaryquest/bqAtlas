import { Injectable, computed, inject, signal } from "@angular/core";
import { WorkspaceService } from "@bqatlas/ui";
import type { ApplicationManifest, SessionInfo } from "@bqatlas/contracts";
import { AtlasApi } from "./api";
@Injectable({ providedIn: "root" })
export class AtlasSession {
  private readonly api = inject(AtlasApi);
  private generation = 0;
  private readonly workspace = inject(WorkspaceService);
  readonly info = signal<SessionInfo | null>(null);
  readonly manifest = signal<ApplicationManifest | null>(null);
  readonly authenticated = computed(() => this.info()?.authenticated === true);
  constructor() {
    this.api.onUnauthorized = () => this.clear();
  }
  has(permission: string) {
    return (
      this.authenticated() && this.info()!.permissions.includes(permission)
    );
  }
  async refresh() {
    const generation = ++this.generation;
    const info = await this.api.request<SessionInfo>("/api/v1/session");
    if (generation !== this.generation) return;
    if (info.id !== this.info()?.id) {
      this.workspace.disposeAll();
      this.manifest.set(null);
    }
    this.info.set(info);
    if (info.authenticated) {
      const manifest =
        await this.api.request<ApplicationManifest>("/api/v1/manifest");
      if (generation !== this.generation) return;
      if (manifest.contractVersion !== "1.0")
        throw new Error("Unsupported server contract version.");
      this.manifest.set(manifest);
    }
  }
  async login(email: string, password: string) {
    await this.api.request("/auth/login", "POST", { email, password });
    this.api.clearSession();
    await this.refresh();
  }
  async logout() {
    // External logout is submitted as a browser form so the provider redirect can navigate.
    if (this.info()?.authMode === "oidc") {
      const csrf = await this.api.request<{ token: string }>(
        "/api/v1/session/csrf",
      );
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/auth/logout";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "__RequestVerificationToken";
      input.value = csrf.token;
      form.append(input);
      document.body.append(form);
      this.clear();
      form.submit();
      return;
    }
    await this.api.request("/auth/logout", "POST");
    this.clear();
    await this.refresh();
  }
  clear() {
    this.generation++;
    this.api.clearSession();
    this.workspace.disposeAll();
    this.manifest.set(null);
    this.info.update((info) =>
      info
        ? {
            ...info,
            authenticated: false,
            id: null,
            name: null,
            permissions: [],
          }
        : null,
    );
  }
}
