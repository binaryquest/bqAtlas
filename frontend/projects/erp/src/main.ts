import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { FormsModule } from "@angular/forms";
import {
  AtlasDialog,
  AtlasStartMenu,
  AtlasStartItem,
  AtlasButton,
  AtlasInput,
  AtlasWorkspace,
  WorkspaceService,
} from "@bqatlas/ui";
import { AtlasSession, CrudWorkspace, AtlasMenus, AtlasMenu, AtlasNavigation, AtlasPasswordChange, AtlasAccountRecovery, consumeAccountRecoveryLink } from "@bqatlas/angular";
import {CustomerCodeField,validateCustomerCode} from "./customer-code";
import { salesFeature } from "./sales/quote-views";
let initialRecoveryLink = consumeAccountRecoveryLink(window.location, window.history);
@Component({
  selector: "app-root",
  imports: [AtlasDialog, AtlasStartMenu, FormsModule, AtlasWorkspace, AtlasButton, AtlasInput, AtlasMenu, AtlasPasswordChange, AtlasAccountRecovery],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (ready()) {
      @if (recovering() && session.info()?.authMode === 'local') {
        <main class="login-layout"><section class="login-panel"><div class="login-form">
          <bqatlas-account-recovery [link]="recoveryLink()" (consumed)="recoveryLink.set(null)" (closed)="closeRecovery()" />
        </div></section></main>
      } @else if (session.authenticated()) {
        <atlas-dialog class="user-account-dialog" title="User account" [(open)]="accountOpen" [busy]="passwordChange()?.busy() || false">
          @if(accountOpen()) {
            <div class="user-account-profile"><span class="atlas-start-avatar" aria-hidden="true">{{ (session.info()?.name || 'A').slice(0, 1).toUpperCase() }}</span><div><strong>{{session.info()?.name}}</strong><p>My account</p></div></div>
            @if(session.info()?.authMode === 'local') {
              <bqatlas-password-change #passwordChange (closed)="accountOpen.set(false)" />
            } @else {
              <p>Your password and account security are managed by your identity provider.</p>
            }
          }
        </atlas-dialog>
        @if(error()){<p role="alert" class="atlas-alert error">{{error()}}</p>}
        @if(navigation.error()){<p role="alert" class="atlas-alert error">{{navigation.error()}}</p>}
        <atlas-workspace
          ><section class="workspace-home">
            <p class="eyebrow">YOUR WORKSPACE</p>
            <h1>Good work starts here.</h1>
            <p class="intro">
              Open a view to find records and keep your work side by side.
            </p>
            <bqatlas-menu />
            @if (!crud.menus().length) {
              <p>No views are available for this account.</p>
            }
            <div class="workspace-note">
              <span class="status-dot"></span>Connected · bqAtlas development
              preview
            </div>
          </section>
          <atlas-start-menu atlasWorkspaceLauncher menuId="erp-start-menu" label="bqAtlas"
            [items]="startItems()" [accountName]="session.info()?.name || 'Account'"
            [accountActions]="accountItems()" (itemSelected)="openStartItem($event)"
            (accountSelected)="accountOpen.set(true)" (accountActionSelected)="accountAction($event)" /></atlas-workspace
        >
      } @else {
        <main class="login-layout">
          <section class="login-story">
            <div class="brand">bq<span>Atlas</span></div>
            <div>
              <p class="eyebrow">A PLACE FOR YOUR BUSINESS</p>
              <h1>Every detail.<br />One workspace.</h1>
              <p>
                Connected records, clear workflows, and room to get things done.
              </p>
            </div>
            <small>ERP application framework</small>
          </section>
          <section class="login-panel">
            <div class="login-form">
              <p class="eyebrow">WELCOME BACK</p>
              <h2>Sign in to your workspace</h2>
              @if (session.info()?.authMode === "oidc") {
                <a class="oidc-link" href="/auth/login"
                  >Continue with your identity provider →</a
                >
              } @else {
                <form (ngSubmit)="login()">
                  <label for="email">Email address</label
                  ><input
                    atlasInput
                    id="email"
                    name="email"
                    type="email"
                    autocomplete="username"
                    required
                    [(ngModel)]="email"
                    [disabled]="busy()"
                  /><label for="password">Password</label
                  ><input
                    atlasInput
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                    [(ngModel)]="password"
                    [disabled]="busy()"
                  /><button
                    atlasButton
                    variant="primary"
                    type="submit"
                    [disabled]="busy()"
                  >
                    {{ busy() ? "Signing in…" : "Sign in" }}
                  </button>
                </form>
                <button atlasButton type="button" (click)="recovering.set(true)">Forgot password or confirm email</button>
              }
              @if (error()) {
                <div class="atlas-alert error" role="alert">{{ error() }}</div>
              }
            </div>
          </section>
        </main>
      }
    } @else {
      <main class="startup">
        <h1>bqAtlas</h1>
        <p>{{ error() || "Connecting to your workspace…" }}</p>
        @if (error()) {
          <button atlasButton (click)="start()">Retry</button>
        }
      </main>
    }`,
})
class App {
  readonly session = inject(AtlasSession);
  readonly crud = inject(CrudWorkspace);
  readonly menus = inject(AtlasMenus);
  readonly navigation = inject(AtlasNavigation);
  readonly accountOpen = signal(false);
  readonly passwordChange = viewChild<AtlasPasswordChange>("passwordChange");
  readonly recoveryLink = signal(initialRecoveryLink);
  readonly recovering = signal(initialRecoveryLink !== null);
  readonly workspace = inject(WorkspaceService);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal("");
  email = "";
  password = "";
  constructor() {
    initialRecoveryLink = null;
    this.crud.register(
      {
        resource: "crm.customers",
        title: "Customers",
        icon: "users",
        writePermission: "crm.customers.write",
        deletePermission: "crm.customers.delete",
        defaults: { code: "", name: "", email: "", active: true },
        fieldRenderers: {code: CustomerCodeField},
        fieldValidators: {code: validateCustomerCode},
      },
      salesFeature,
    );
    this.menus.register(
      {id:'crm',kind:'group',label:'Customer management',labelKey:'menu.crm',order:10,children:[{id:'crm.customers',kind:'resource',label:'Customers',labelKey:'menu.customers',resource:'crm.customers'}]},
      {id:'sales',kind:'group',label:'Sales',labelKey:'menu.sales',order:20,children:[{id:'sales.quotes',kind:'resource',label:'Sales quotes',labelKey:'menu.quotes',resource:'sales.quotes'}]},
    );
    void this.start();
  }
  startItems(): AtlasStartItem[] {
    const items: AtlasStartItem[] = [];
    const visit = (nodes: ReturnType<AtlasMenus['visible']>) => {
      for (const node of nodes) {
        if (node.kind === 'group') visit(node.children as ReturnType<AtlasMenus['visible']>);
        else items.push({id: node.id, label: node.label, icon: node.kind === 'resource' ? (this.crud.menus().find(item => item.resource === node.resource)?.icon || 'grid') : 'grid'});
      }
    };
    visit(this.menus.visible());
    return [...items, {id: 'workspace.close-all', label: 'Close all windows', icon: 'close', separatorBefore: true, disabled: !this.workspace.tasks().length || this.workspace.closingAll()}];
  }
  accountItems(): AtlasStartItem[] {
    return [
      {id: 'logout', label: 'Sign out', icon: 'arrow'},
    ];
  }
  async openStartItem(id: string) {
    this.error.set("");
    if (id === 'workspace.close-all') { await this.workspace.requestCloseAll(); return; }
    try { await this.menus.activate(id); } catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to open view.'); }
  }
  accountAction(id: string) {
    if (id === 'logout') void this.logout();
  }
  closeRecovery() { this.recoveryLink.set(null); this.recovering.set(false); }
  async start() {
    this.error.set("");
    try {
      await this.session.refresh();
      this.ready.set(true);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "Cannot connect.",
      );
    }
  }
  async login() {
    this.busy.set(true);
    this.error.set("");
    try {
      await this.session.login(this.email, this.password);
      this.password = "";
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    } finally {
      this.busy.set(false);
    }
  }
  async logout() {
    if (
      this.workspace.tasks().some((t) => t.dirty()) &&
      !confirm("Sign out and discard unsaved changes?")
    )
      return;
    try {
      await this.session.logout();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  }
}
bootstrapApplication(App).catch(console.error);
