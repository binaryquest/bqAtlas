import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironmentInjector,runInInjectionContext,Injector} from '@angular/core';
import {CrudWorkspace,AtlasSession,RestLookupProvider,ReferenceLookup} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
import {WorkspaceService} from '../dist/ui/fesm2022/bqatlas-ui.mjs';
function setup(permissions=['read','write']) {
 const workspace=new WorkspaceService();
 const session={has:p=>permissions.includes(p),manifest:()=>({resources:[{id:'customers',readPermission:'read'}]})};
 const injector=createEnvironmentInjector([{provide:WorkspaceService,useValue:workspace},{provide:AtlasSession,useValue:session}],Injector.NULL);
 const crud=runInInjectionContext(injector,()=>new CrudWorkspace());
 crud.register({resource:'customers',title:'Customers',icon:'users',writePermission:'write',deletePermission:'delete',defaults:{active:true}});
 return {crud,workspace,injector};
}
test('related editors never hijack existing editors and have independently cancellable results',async()=>{
 const {crud,workspace,injector}=setup(); const received=[];
 try {crud.openEditor('customers','same');
 const a=crud.openRelated('customers','parent-a',async id=>received.push(['a',id]),'same');
 const b=crud.openRelated('customers','parent-b',async id=>received.push(['b',id]),'same');
 assert.equal(workspace.tasks().length,3);assert.notEqual(a.task.key,b.task.key);
 await crud.returnRelated(b.task.data().relation,'same');assert.deepEqual(received,[['b','same']]);
 a.cancel();await assert.rejects(crud.returnRelated(a.task.data().relation,'same'),/no longer available/);
 await assert.rejects(crud.returnRelated(b.task.data().relation,'same'));
 } finally {injector.destroy();}
});
test('read-only users can open existing relations but cannot create; lookup-only cannot open',()=>{
 for(const permissions of [['read'],[]]) {const {crud,injector}=setup(permissions);try{
 assert.throws(()=>crud.openRelated('customers','parent',async()=>{}));
 if(permissions.length)assert.ok(crud.openRelated('customers','parent',async()=>{},'id'));
 else assert.throws(()=>crud.openRelated('customers','parent',async()=>{},'id'));
 }finally{injector.destroy();}}
});
test('lookup resolution uses minimal endpoint and cancellation',async()=>{
 const calls=[];const provider=new RestLookupProvider({request:async(...args)=>{calls.push(args);return {id:'a'};}},'/api/customers/lookup');
 const controller=new AbortController();await provider.resolve('a/b',controller.signal);
 assert.deepEqual(calls[0],['/api/customers/lookup/a%2Fb','GET',undefined,controller.signal]);
});
test('late child resolution cannot overwrite a changed parent',async()=>{
 let callback,finish,value='original',selected=0;const info={id:'user'};
 const c={canOpen:()=>true,disabled:()=>false,canCreate:()=>true,readonly:()=>false,
 provider:()=>({resolve:()=>new Promise(r=>finish=r)}),pickerOpen:{set(){}},relationError:{set(){}},
 value:()=>value,revision:0,contextKey:()=>'',session:{info:()=>info},alive:true,
 workspace:{tasks:()=>[{id:'parent'},{id:'child'}]},parent:{id:'parent'},resource:()=> 'customers',nameField:()=> 'name',query:'New',
 controller:new AbortController(),children:new Set(),select:()=>selected++,
 crud:{openRelated:(_r,_p,fn)=>{callback=fn;return {task:{id:'child'},cancel(){}};}}};
 ReferenceLookup.prototype.openRelated.call(c,true);
 const pending=callback('saved');value='changed';finish({id:'saved'});
 await assert.rejects(pending,/no longer available/);assert.equal(selected,0);
 await assert.rejects(callback('saved'),/originating field changed/);
});
test('editing an existing relation refreshes cached caption without rewriting parent business values',async()=>{
 let callback;const info={id:'user'},rows=[{id:'original',name:'Old'}];let caption='',selected=0;
 const c={canOpen:()=>true,disabled:()=>false,canCreate:()=>true,readonly:()=>false,
 provider:()=>({resolve:async()=>({id:'original',name:'Updated'})}),pickerOpen:{set(){}},relationError:{set(){}},
 value:()=> 'original',revision:0,contextKey:()=>'',session:{info:()=>info},alive:true,
 workspace:{tasks:()=>[{id:'parent'},{id:'child'}]},parent:{id:'parent'},resource:()=> 'customers',nameField:()=> 'name',query:'',
 controller:new AbortController(),children:new Set(),select:()=>selected++,recordKey:()=>row=>row.id,
 request:{cancel(){}},loading:{set(){}},rows:{update:fn=>rows.splice(0,rows.length,...fn(rows))},
 displayWith:()=>row=>row.name,resolvedCaption:{set:value=>caption=value},host:{nativeElement:{querySelector:()=>null}},
 crud:{openRelated:(_r,_p,fn)=>{callback=fn;return {task:{id:'child'},cancel(){}};}}};
 ReferenceLookup.prototype.openRelated.call(c,false);await callback('original');
 assert.equal(selected,0);assert.equal(caption,'Updated');assert.equal(rows[0].name,'Updated');
});
