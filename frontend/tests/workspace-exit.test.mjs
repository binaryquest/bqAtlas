import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {WorkspaceService,AtlasWorkspace,AtlasWindow} from '../dist/ui/fesm2022/bqatlas-ui.mjs';
function workspace(){const ws=new WorkspaceService();ws.register({id:'editor',title:'Record',icon:'edit',component:class{},instance:'multiple'});return ws;}
const open=ws=>ws.open({screen:'editor',data:{}});
test('close all saves or discards each dirty task and cancel retains remaining drafts',async()=>{
 const ws=workspace();const first=open(ws),second=open(ws),clean=open(ws);first.dirty.set(true);second.dirty.set(true);
 assert.equal(ws.requestCloseAll(),true);assert.equal(ws.tasks().includes(clean),false);assert.equal(ws.pendingClose(),second.id);
 ws.discardClose();assert.equal(ws.pendingClose(),first.id);ws.cancelClose();assert.equal(ws.closingAll(),false);assert.equal(ws.tasks().length,1);assert.equal(first.dirty(),true);
 first.lifecycle.save=async()=>{};ws.requestCloseAll();await ws.saveAndClose();assert.equal(ws.tasks().length,0);assert.equal(ws.closingAll(),false);
});
test('failed saves pause close-all and new tasks are outside its snapshot',async()=>{
 const ws=workspace();const first=open(ws);first.dirty.set(true);first.lifecycle.save=async()=>{throw new Error('Server rejected');};
 ws.requestCloseAll();const later=open(ws);await ws.saveAndClose();assert.equal(ws.pendingClose(),first.id);assert.equal(first.dirty(),true);assert.equal(first.error(),'Server rejected');
 ws.discardClose();assert.deepEqual(ws.tasks().map(t=>t.id),[later.id]);assert.equal(ws.closingAll(),false);
});
test('saving tasks prevent close-all and trigger the browser exit guard',()=>{
 const ws=workspace();const task=open(ws);task.saving.set(true);assert.equal(ws.requestCloseAll(),false);assert.equal(ws.tasks().length,1);
 let prevented=false;const event={preventDefault:()=>{prevented=true;},returnValue:undefined};
 AtlasWorkspace.prototype.guardPageExit.call({ws},event);assert.equal(prevented,true);assert.equal(event.returnValue,'');
 task.saving.set(false);prevented=false;AtlasWorkspace.prototype.guardPageExit.call({ws},event);assert.equal(prevented,false);
 task.dirty.set(true);assert.equal(ws.hasPendingWork(),true);ws.disposeAll();assert.equal(ws.hasPendingWork(),false);
});

test('delayed background save closes only its original task and preserves the active draft',async()=>{
 const ws=workspace(),first=open(ws);first.dirty.set(true);
 let complete;first.lifecycle.save=()=>new Promise(resolve=>complete=resolve);
 await ws.requestClose(first.id);const saving=ws.saveAndClose();
 const second=open(ws);second.data.set({name:'Still editing'});second.dirty.set(true);
 assert.equal(ws.tasks().length,2);assert.equal(first.saving(),true);
 complete();await saving;
 assert.deepEqual(ws.tasks().map(task=>task.id),[second.id]);assert.equal(ws.activeId(),second.id);
 assert.equal(second.dirty(),true);assert.equal(second.data().name,'Still editing');
});

test('old-session save completion cannot dismiss a new-session close dialog',async()=>{
 const ws=workspace(),old=open(ws);old.dirty.set(true);
 let complete;old.lifecycle.save=()=>new Promise(resolve=>complete=resolve);
 await ws.requestClose(old.id);const saving=ws.saveAndClose();
 ws.disposeAll();const current=open(ws);current.dirty.set(true);current.data.set({name:'New session draft'});
 await ws.requestClose(current.id);
 complete();await saving;
 assert.equal(ws.pendingClose(),current.id);assert.equal(ws.activeId(),current.id);
 assert.deepEqual(ws.tasks().map(task=>task.id),[current.id]);assert.equal(current.dirty(),true);
 assert.equal(current.data().name,'New session draft');
});


test('window save shortcut covers frame focus without duplicating editor handling or crossing task/modal ownership',async()=>{
 const ws=workspace(),first=open(ws),second=open(ws);let saves=0;
 second.lifecycle.save=async()=>{saves++;};first.lifecycle.save=async()=>{throw new Error('Inactive task must not save');};
 const dispatch=(task,handled=false)=>{
  const event={defaultPrevented:handled,preventDefault(){this.defaultPrevented=true;}};
  AtlasWindow.prototype.saveShortcut.call({ws,task:()=>task},event);return event;
 };
 assert.equal(dispatch(first).defaultPrevented,false);assert.equal(saves,0);
 dispatch(second,true);assert.equal(saves,0);
 assert.equal(dispatch(second).defaultPrevented,true);assert.equal(saves,1);
 // Repeated shortcuts while a request is pending must not duplicate the save.
 dispatch(second);assert.equal(saves,1);await Promise.resolve();
 second.dirty.set(true);await ws.requestClose(second.id);
 assert.equal(dispatch(second).defaultPrevented,false);assert.equal(saves,1);
 ws.cancelClose();delete second.lifecycle.save;
 assert.equal(dispatch(second).defaultPrevented,false);assert.equal(saves,1);
});
