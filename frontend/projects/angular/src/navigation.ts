import {DestroyRef, Injectable, effect, inject, signal} from '@angular/core';
import {WorkspaceService} from '@bqatlas/ui';
import {AtlasSession} from './session';
import {CrudWorkspace} from './crud';

export type WorkspaceRoute = {kind:'home'} | {kind:'list';resource:string} | {kind:'record';resource:string;id:string} | {kind:'draft';task:string};
const resourceId=/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
export function parseWorkspaceRoute(hash:string):WorkspaceRoute {
  if(!hash||hash==='#'||hash==='#/')return {kind:'home'};
  const parts=hash.replace(/^#/, '').split('/');
  if(parts[0]!==''||parts.length>4)throw new Error('Invalid workspace link.');
  if(parts[1]==='draft'&&parts.length===3&&/^task-[0-9]+$/.test(parts[2]))return {kind:'draft',task:parts[2]};
  const resource=decodeURIComponent(parts[2]??'');
  if(!resourceId.test(resource))throw new Error('Invalid resource link.');
  if(parts[1]==='list'&&parts.length===3)return {kind:'list',resource};
  if(parts[1]==='record'&&parts.length===4){
    const id=decodeURIComponent(parts[3]);
    if(!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))throw new Error('Invalid record link.');
    return {kind:'record',resource,id};
  }
  throw new Error('Invalid workspace link.');
}
export function workspaceHash(route:WorkspaceRoute):string {
  switch(route.kind){
    case 'home':return '#/';
    case 'list':return `#/list/${encodeURIComponent(route.resource)}`;
    case 'record':return `#/record/${encodeURIComponent(route.resource)}/${encodeURIComponent(route.id)}`;
    case 'draft':return `#/draft/${route.task}`;
  }
}

/** Hash routes keep API hosting simple. Back switches retained views; it never discards a task. */
@Injectable({providedIn:'root'})
export class AtlasNavigation {
  private readonly session=inject(AtlasSession);
  private readonly crud=inject(CrudWorkspace);
  private readonly workspace=inject(WorkspaceService);
  readonly error=signal('');
  private initialized=false;
  private hadSession=false;
  private lastHash='';
  private readonly storageKey='bqatlas.returnRoute';
  constructor(){
    const destroy=inject(DestroyRef);
    if(typeof window==='undefined')return;
    const navigate=()=>{if(window.location.hash!==this.lastHash)this.restore(window.location.hash);};
    window.addEventListener('popstate',navigate);window.addEventListener('hashchange',navigate);
    destroy.onDestroy(()=>{window.removeEventListener('popstate',navigate);window.removeEventListener('hashchange',navigate);});
    if(window.location.hash){try{parseWorkspaceRoute(window.location.hash);this.remember(window.location.hash);}catch{/* Invalid incoming links are handled after login. */}}
    effect(()=>{
      const authenticated=this.session.authenticated();const manifest=this.session.manifest();
      const active=this.workspace.active();const data=active?.data() as {resource?:string;id?:string}|undefined;
      if(!authenticated||!manifest){
        this.initialized=false;
        if(this.hadSession){this.hadSession=false;this.remember(null);this.replace('#/');}
        return;
      }
      if(!this.initialized){
        this.initialized=true;this.hadSession=true;
        const hash=window.location.hash||this.remembered()||'#/';
        this.remember(null);this.restore(hash);return;
      }
      let route:WorkspaceRoute={kind:'home'};
      if(active&&data?.resource){
        if(active.screen.endsWith('.editor')||active.screen==='bqatlas.editor')route=data.id?{kind:'record',resource:data.resource,id:data.id}:{kind:'draft',task:active.id};
        else route={kind:'list',resource:data.resource};
      }
      const hash=workspaceHash(route);
      if(window.location.hash!==hash){window.history.pushState(null,'',hash);this.lastHash=hash;this.error.set('');}
    });
  }
  private remember(hash:string|null){try{if(hash===null)sessionStorage.removeItem(this.storageKey);else sessionStorage.setItem(this.storageKey,hash);}catch{/* Storage can be unavailable; in-page navigation still works. */}}
  private remembered():string|null{try{return sessionStorage.getItem(this.storageKey);}catch{return null;}}
  private replace(hash:string){window.history.replaceState(null,'',hash);this.lastHash=hash;}
  private restore(hash:string){
    if(!this.session.authenticated()||!this.session.manifest())return;
    this.lastHash=hash;this.error.set('');
    try{
      const route=parseWorkspaceRoute(hash);
      this.replace(workspaceHash(route));
      if(route.kind==='home')this.workspace.showDesktop();
      else if(route.kind==='list')this.crud.openList(route.resource);
      else if(route.kind==='record')this.crud.openEditor(route.resource,route.id);
      else{
        const task=this.workspace.tasks().find(task=>task.id===route.task);
        if(!task)throw new Error('This unsaved draft is no longer available. Draft links work only in the current workspace.');
        const data=task.data() as {resource?:string};if(!data.resource)throw new Error('This view is unavailable.');
        this.crud.descriptor(data.resource);this.workspace.activate(task.id);
      }
    }catch(error){this.workspace.showDesktop();this.replace('#/');this.error.set(error instanceof Error?error.message:'Unable to open this link.');}
  }
}
