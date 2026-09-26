import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentInjector,runInInjectionContext,Injector} from '@angular/core';
import {AtlasPasswordChange,AtlasApi,AtlasSession,ApiError} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
import {WorkspaceService} from '../dist/ui/fesm2022/bqatlas-ui.mjs';
function setup(request){let dirty=false;let cleared=false;const injector=createEnvironmentInjector([{provide:AtlasApi,useValue:{request}},{provide:AtlasSession,useValue:{info:()=>({authMode:'local'}),authenticated:()=>true,clear:()=>{cleared=true;},refresh:async()=>{}}},{provide:WorkspaceService,useValue:{hasPendingWork:()=>dirty}}],Injector.NULL);const component=runInInjectionContext(injector,()=>new AtlasPasswordChange());return {component,injector,setDirty:value=>{dirty=value;},cleared:()=>cleared};}
const fill=component=>{component.currentPassword='Current!12345';component.newPassword='New-password!123';component.confirmation=component.newPassword;};
test('password form refuses unsaved-work transitions and clears secrets after server failures',async()=>{
 let requests=0;const state=setup(async()=>{requests++;throw new ApiError(400,{errors:{currentPassword:['Incorrect password.']}});});
 try{fill(state.component);state.setDirty(true);await state.component.submit();assert.equal(requests,0);state.setDirty(false);await state.component.submit();assert.equal(requests,1);assert.equal(state.component.currentPassword,'');assert.equal(state.component.newPassword,'');assert.equal(state.component.confirmation,'');assert.equal(state.component.error(),'Incorrect password.');assert.equal(state.cleared(),false);}finally{state.injector.destroy();}
});
test('successful password change closes the form and clears the local session',async()=>{
 let path;const state=setup(async value=>{path=value;});try{fill(state.component);let closed=false;state.component.closed.subscribe(()=>{closed=true;});await state.component.submit();assert.equal(path,'/auth/change-password');assert.equal(closed,true);assert.equal(state.cleared(),true);assert.equal(state.component.newPassword,'');}finally{state.injector.destroy();}
});
