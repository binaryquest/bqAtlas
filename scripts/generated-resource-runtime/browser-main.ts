import {Component, inject, signal} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {AtlasWorkspace, WorkspaceService, AtlasButton} from '@bqatlas/ui';
import {AtlasApi, AtlasSession, CrudWorkspace, AtlasMenus, AtlasMenu, AtlasNavigation, ODataResourceProvider, RestResourceProvider} from '@bqatlas/angular';
import {feature,menu} from './generated-product';
import {fields} from './review-fields';

@Component({selector:'app-root',imports:[AtlasWorkspace,AtlasMenu,AtlasButton],template:`
  <header class="app-header"><strong>Generated Product review</strong><div class="app-actions"><a href="/?provider=rest">REST reads</a><a href="/?provider=odata">OData reads</a><a href="/test/write-delay/true">Enable 10s write delay</a><a href="/test/write-delay/false">Disable write delay</a><a href="/test/query-delay/true">Enable 10s query delay</a><a href="/test/query-delay/false">Disable query delay</a><button atlasButton [disabled]="!workspace.tasks().length" (click)="workspace.requestCloseAll()">Close all</button></div></header>
  @if(error()){<p role="alert">{{error()}}</p>}
  @if(ready() && session.authenticated()){
    <atlas-workspace><section class="workspace-home"><h1>Generated CRUD</h1><p>{{adapter}} adapter · synthetic loopback test identity</p><bqatlas-menu /></section></atlas-workspace>
  }@else if(ready()) {<main class="workspace-home"><p>This disposable harness tests generated CRUD, not Identity login.</p><a href="/test/browser-login/writer">Enter as test writer</a></main>}
`})
class ReviewApp {
  readonly session=inject(AtlasSession);readonly workspace=inject(WorkspaceService);
  readonly ready=signal(false);readonly error=signal('');
  readonly adapter=new URLSearchParams(location.search).get('provider')==='odata'?'OData':'REST';
  constructor(){
    const crud=inject(CrudWorkspace);inject(AtlasNavigation);
    crud.register({...feature,...(this.adapter==='OData'?{provider:(api:AtlasApi)=>new ODataResourceProvider<Record<string,unknown>>(api,'/odata/v1/inventory/Products',new RestResourceProvider<Record<string,unknown>>(api,'/api/v1/inventory/products'),{fields,key:'id',searchFields:['sku','description'],map:wire=>Object.fromEntries([...Object.entries(fields).map(([name,field])=>[name,wire[field.property]]),['modifiedAt',wire['ModifiedAt']]])})}:{})});
    inject(AtlasMenus).register(menu);
    void this.session.refresh().then(()=>{this.ready.set(true);}).catch(error=>{this.error.set(error.message);this.ready.set(true);});
  }
}
bootstrapApplication(ReviewApp).catch(console.error);
