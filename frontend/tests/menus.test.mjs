import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentInjector,runInInjectionContext,Injector} from '@angular/core';
import {AtlasMenus,AtlasSession,CrudWorkspace,visibleMenu,validateMenu} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
const nodes=[{id:'sales',kind:'group',label:'Sales',order:20,children:[{id:'quotes',kind:'resource',label:'Quotes',resource:'sales.quotes'}]},{id:'crm',kind:'group',label:'CRM',order:10,children:[{id:'customers',kind:'resource',label:'Customers',resource:'crm.customers'},{id:'export',kind:'command',label:'Export',command:'export'}]}];
test('menu groups are ordered and inaccessible children and empty groups disappear',()=>{
 const commands=new Map([['export',{id:'export',permission:'export',run:()=>{}}]]);
 const visible=visibleMenu(nodes,new Set(),new Set(['crm.customers']),commands);
 assert.deepEqual(visible.map(n=>n.id),['crm']);assert.deepEqual(visible[0].children.map(n=>n.id),['customers']);
 assert.deepEqual(visibleMenu(nodes,new Set(),new Set(),commands),[]);
 assert.deepEqual(visibleMenu(nodes,new Set(['export']),new Set(['crm.customers','sales.quotes']),commands).map(n=>n.id),['crm','sales']);
 assert.equal(nodes[0].children.length,1);
});
test('menu validation rejects duplicate nested IDs and cyclic groups',()=>{
 assert.throws(()=>validateMenu([...nodes,{id:'customers',kind:'resource',label:'Again',resource:'crm.customers'}]),/Duplicate/);
 const group={id:'cycle',kind:'group',label:'Cycle',children:[]};group.children.push(group);assert.throws(()=>validateMenu([group]),/Duplicate/);
});
test('menu activation rechecks permissions and awaits command failures',async()=>{
 let permissions=['export'];let allowed=['crm.customers'];let authenticated=true;let opened;
 const injector=createEnvironmentInjector([{provide:AtlasSession,useValue:{authenticated:()=>authenticated,info:()=>({permissions})}},{provide:CrudWorkspace,useValue:{menus:()=>allowed.map(resource=>({resource})),openList:resource=>{opened=resource;}}}],Injector.NULL);
 try{
  const menu=runInInjectionContext(injector,()=>new AtlasMenus());menu.register(...nodes);
  menu.registerCommand({id:'export',permission:'export',run:async()=>{throw new Error('Export failed');}});
  await menu.activate('customers');assert.equal(opened,'crm.customers');
  await assert.rejects(menu.activate('export'),/Export failed/);
  permissions=[];await assert.rejects(menu.activate('export'),/unavailable/);
  allowed=[];await assert.rejects(menu.activate('customers'),/unavailable/);
  authenticated=false;assert.deepEqual(menu.visible(),[]);
 }finally{injector.destroy();}
});
