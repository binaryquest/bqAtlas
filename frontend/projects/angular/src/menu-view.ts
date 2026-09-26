import {ChangeDetectionStrategy, Component, inject, input, signal} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {AtlasMenus} from './menus';
@Component({
  selector:'bqatlas-menu',
  imports:[NgTemplateOutlet],
  changeDetection:ChangeDetectionStrategy.OnPush,
  styles:[`:host{display:block} ul{list-style:none;margin:0;padding:0;display:grid;gap:12px} ul ul{padding-left:16px} .menu-group{font-weight:600;margin:12px 0 8px} button{font:inherit;text-align:left;border:1px solid var(--atlas-border,#d5dbe5);border-radius:10px;background:var(--atlas-surface,#fff);color:inherit;padding:16px 20px;cursor:pointer;width:100%} button:hover{background:var(--atlas-surface-hover,#f5f7fa)} button:focus-visible{outline:2px solid var(--atlas-accent,#2869d8);outline-offset:2px}.menu-error{color:#b42318}`],
  template:`<nav aria-label="Application views"><ng-container *ngTemplateOutlet="items;context:{$implicit:menus.visible()}" /></nav>
  @if(error()){<p class="menu-error" role="alert">{{error()}}</p>}
  <ng-template #items let-nodes><ul>
    @for(node of nodes;track node.id){<li>
      @if(node.kind==='group'){
        <div class="menu-group">{{text(node.labelKey,node.label)}}</div>
        <ng-container *ngTemplateOutlet="items;context:{$implicit:node.children}" />
      }@else{<button type="button" [disabled]="pending()===node.id" (click)="activate(node.id)">{{text(node.labelKey,node.label)}}</button>}
    </li>}
  </ul></ng-template>`,
})
export class AtlasMenu {
  readonly menus=inject(AtlasMenus);
  readonly translate=input<(key:string,fallback:string)=>string>((_key,fallback)=>fallback);
  readonly pending=signal<string|null>(null);
  readonly error=signal('');
  text(key:string|undefined,fallback:string){return key?this.translate()(key,fallback):fallback;}
  async activate(id:string){
    if(this.pending())return;
    this.pending.set(id);this.error.set('');
    try{await this.menus.activate(id);}catch(error){this.error.set(error instanceof Error?error.message:'Unable to open this menu.');}finally{this.pending.set(null);}
  }
}
