import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseWorkspaceRoute,workspaceHash,AtlasNavigation} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
test('workspace links round-trip opaque record IDs without treating them as URL paths',()=>{
 for(const route of [{kind:'home'},{kind:'list',resource:'crm.customers'},{kind:'record',resource:'crm.customers',id:'a/b ?#é'},{kind:'draft',task:'task-123'}])assert.deepEqual(parseWorkspaceRoute(workspaceHash(route)),route);
 for(const hash of ['#https://evil.test','#/record/../x','#/record/crm.customers/','#/record/crm.customers/%00','#/record/crm.customers/%zz','#/list/crm.customers/extra'])assert.throws(()=>parseWorkspaceRoute(hash));
});
test('route activation checks current resource access and never disposes retained tasks',()=>{
 let called;let activated;let home=false;let replaced;const errors=[];
 const instance={session:{authenticated:()=>true,manifest:()=>({})},crud:{openList:id=>{called=['list',id];},openEditor:(resource,id)=>{called=['record',resource,id];},descriptor:()=>{throw new Error('Unavailable');}},workspace:{showDesktop:()=>{home=true;},tasks:()=>[{id:'task-1',data:()=>({resource:'crm.customers'})}],activate:id=>{activated=id;}},error:{set:value=>errors.push(value)},replace:hash=>{replaced=hash;}};
 AtlasNavigation.prototype.restore.call(instance,'#/record/crm.customers/one');assert.deepEqual(called,['record','crm.customers','one']);
 AtlasNavigation.prototype.restore.call(instance,'#/draft/task-1');assert.equal(activated,undefined);assert.equal(home,true);assert.equal(replaced,'#/');assert.equal(errors.at(-1),'Unavailable');
 home=false;AtlasNavigation.prototype.restore.call(instance,'#/');assert.equal(home,true);
});
