import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordDraft, AtlasApi } from '../dist/angular/fesm2022/bqatlas-angular.mjs';
import { WorkspaceService } from '../dist/ui/fesm2022/bqatlas-ui.mjs';
test('two editors have independent drafts and revert to their own saved value', () => {
 const a = new RecordDraft(), b = new RecordDraft();const source={id:'1',name:'Saved',nested:{value:1}};
 a.accept({data:source,version:'v1'});b.accept({data:source,version:'v1'});
 a.change('name','Changed');a.value().nested.value=9;
 assert.equal(b.value().name,'Saved');assert.equal(b.value().nested.value,1);assert.equal(source.nested.value,1);
 a.revert();assert.equal(a.value().name,'Saved');assert.equal(a.value().nested.value,1);assert.equal(a.dirty(),false);
});
test('ending a session clears dirty tasks even if a disposal hook fails', () => {
 const ws=new WorkspaceService();ws.register({id:'customer',title:'Customer',icon:'users',instance:'multiple',component:class{}});
 let disposed=0;const a=ws.open({screen:'customer',data:{secret:'private'}});a.dirty.set(true);a.lifecycle.dispose=()=>{throw new Error('cleanup');};
 ws.open({screen:'customer',data:{}}).lifecycle.dispose=()=>disposed++;
 ws.pendingClose.set(a.id);ws.disposeAll();assert.equal(ws.tasks().length,0);assert.equal(ws.activeId(),null);assert.equal(ws.pendingClose(),null);assert.equal(disposed,1);assert.deepEqual(ws.history,[]);
});

test('a delayed 401 from an old session does not sign out a newer session', async () => {
 const original=globalThis.fetch;let finish;const api=new AtlasApi();let signouts=0;api.onUnauthorized=()=>signouts++;
 globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
 try {const pending=api.request('/api/v1/example');api.clearSession();finish(new Response(JSON.stringify({title:'Unauthorized'}),{status:401}));await assert.rejects(pending);assert.equal(signouts,0);}
 finally{globalThis.fetch=original;}
});
test('a session change while fetching CSRF prevents the old mutation from being sent', async () => {
 const original=globalThis.fetch;let finish,calls=0;const api=new AtlasApi();
 globalThis.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 try{const pending=api.request('/api/v1/example','POST',{});api.clearSession();finish(new Response(JSON.stringify({token:'old-token'})));await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});

for (const authMode of ['local', 'oidc']) test(`${authMode} expired response clears identity, permissions, drafts and late manifest`, async () => {
 const {createEnvironmentInjector,runInInjectionContext,Injector}=await import('@angular/core');
 const {AtlasSession}=await import('../dist/angular/fesm2022/bqatlas-angular.mjs');
 const api=new AtlasApi(),workspace=new WorkspaceService();
 workspace.register({id:'customer',title:'Customer',icon:'users',instance:'multiple',component:class{}});
 const injector=createEnvironmentInjector([{provide:AtlasApi,useValue:api},{provide:WorkspaceService,useValue:workspace}],Injector.NULL);
 const session=runInInjectionContext(injector,()=>new AtlasSession());
 const info={authenticated:true,id:'previous-user',name:'Previous user',permissions:['crm.customers.read'],authMode};
 session.info.set(info);session.manifest.set({contractVersion:'1.0',resources:[{id:'private-resource'}]});
 const task=workspace.open({screen:'customer',data:{privateValue:'draft'}});task.dirty.set(true);
 let disposed=false;task.lifecycle.dispose=()=>{disposed=true;};workspace.pendingClose.set(task.id);
 const original=globalThis.fetch;let resolveManifest;let manifestStarted;
 const started=new Promise(resolve=>manifestStarted=resolve);
 globalThis.fetch=async path=>{
   if(path==='/api/v1/session')return new Response(JSON.stringify(info));
   if(path==='/api/v1/manifest'){manifestStarted();return new Promise(resolve=>resolveManifest=resolve);}
   return new Response(JSON.stringify({title:'Unauthorized'}),{status:401});
 };
 try {
   const refresh=session.refresh();await started;
   await assert.rejects(api.request('/api/v1/crm/customers/private'),error=>error.status===401);
   assert.equal(session.authenticated(),false);assert.equal(session.info().id,null);assert.deepEqual(session.info().permissions,[]);
   assert.equal(session.manifest(),null);assert.equal(workspace.tasks().length,0);assert.equal(workspace.pendingClose(),null);assert.equal(disposed,true);
   resolveManifest(new Response(JSON.stringify({contractVersion:'1.0',resources:[{id:'old-private-resource'}]})));await refresh;
   assert.equal(session.manifest(),null);assert.equal(session.authenticated(),false);
 }finally{globalThis.fetch=original;injector.destroy();}
});
