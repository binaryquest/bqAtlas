import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentInjector,runInInjectionContext,Injector} from '@angular/core';
import {AtlasAccountRecovery,AtlasApi,AtlasSession,consumeAccountRecoveryLink} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
function setup(request,link=null){let cleared=false;const injector=createEnvironmentInjector([{provide:AtlasApi,useValue:{request}},{provide:AtlasSession,useValue:{clear:()=>{cleared=true;}}}],Injector.NULL);const component=runInInjectionContext(injector,()=>new AtlasAccountRecovery());component.link=()=>link;return {component,injector,cleared:()=>cleared};}
test('recovery link consumption strips secrets and preserves route, state and unrelated query',()=>{
 const state={route:3};let replaced;const history={state,replaceState:(...args)=>{replaced=args;}};
 assert.deepEqual(consumeAccountRecoveryLink({href:'https://erp.example/?accountAction=reset&userId=user&token=a%2Bb%3D&locale=en#/home'},history),{action:'reset',userId:'user',token:'a+b='});
 assert.deepEqual(replaced,[state,'','/?locale=en#/home']);
 assert.equal(consumeAccountRecoveryLink({href:'https://erp.example/?accountAction=invalid&token=secret'},history),null);
 assert.equal(replaced[2],'/');
});
test('email requests use generic acknowledgement and confirmation is never submitted on initialization',async()=>{
 const calls=[];const state=setup(async(...args)=>{calls.push(args);});
 try{state.component.email=' someone@example.com ';state.component.toggleMode();await state.component.submit();assert.equal(calls[0][0],'/auth/request-confirmation');assert.deepEqual(calls[0][2],{email:'someone@example.com'});assert.match(state.component.message(),/If the account is eligible/);}finally{state.injector.destroy();}
 const confirm=setup(async()=>{calls.push('confirm');},{action:'confirm',userId:'u',token:'t'});
 try{assert.equal(calls.length,1);await confirm.component.submit();assert.equal(calls.length,2);assert.equal(confirm.component.done(),true);}finally{confirm.injector.destroy();}
});
test('reset failure clears passwords and successful retry releases the token and clears the browser session',async()=>{
 let requests=0;let consumed=false;const state=setup(async(path,method,body)=>{requests++;assert.equal(path,'/auth/reset-password');assert.equal(body.token,'token');if(requests===1)throw new Error('Expired link.');},{action:'reset',userId:'u',token:'token'});
 try{state.component.consumed.subscribe(()=>{consumed=true;});state.component.password='New-password!123';state.component.confirmation='mismatch';await state.component.submit();assert.equal(requests,0);
 state.component.confirmation=state.component.password;await state.component.submit();assert.equal(state.component.password,'');assert.equal(state.component.confirmation,'');assert.equal(consumed,false);assert.equal(state.cleared(),false);
 state.component.password=state.component.confirmation='New-password!123';await state.component.submit();assert.equal(consumed,true);assert.equal(state.cleared(),true);assert.equal(state.component.done(),true);assert.equal(state.component.password,'');await state.component.submit();assert.equal(requests,2);
 }finally{state.injector.destroy();}
});
