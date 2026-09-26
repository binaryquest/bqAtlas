import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateFields,editableValues,selectListFields} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
const field=(name,type,extra={})=>({name,label:name,type,required:true,maxLength:null,readOnly:false,options:null,...extra});
test('semantic draft validation keeps exact decimal strings and real date-only values',()=>{
 const fields=[field('amount','decimal',{scale:4}),field('date','date'),field('count','integer'),field('currency','enum',{options:['USD','EUR']})];
 assert.deepEqual(validateFields(fields,{amount:'9007199254740993.0001',date:'2024-02-29',count:3,currency:'USD'}),{});
 const errors=validateFields(fields,{amount:'1e9',date:'2025-02-29',count:9007199254740992,currency:'INVALID'});
 assert.deepEqual(Object.keys(errors),['amount','date','count','currency']);
});
test('required false is a valid boolean and read-only fields never enter editable payloads',()=>{
 const fields=[field('active','boolean'),field('label','string'),field('total','decimal',{readOnly:true})];
 const value={active:false,label:'Hello',total:'100',injected:'unlisted'};
 assert.deepEqual(validateFields(fields,value),{});assert.deepEqual(editableValues(fields,value),{active:false,label:'Hello'});
 assert.ok(validateFields(fields,{...value,label:'  '}).label);
});
test('decimal precision and bounds are explicit and reference values need a custom editor',()=>{
 assert.ok(validateFields([field('amount','decimal',{scale:2,maximum:'100'})],{amount:'100.01'}).amount);
 assert.ok(validateFields([field('amount','decimal',{scale:2})],{amount:'1.001'}).amount);
 assert.ok(validateFields([field('customer','reference')],{customer:'customer-id'}).customer);
});
test('custom validators add business rules without erasing built-in errors or mutating drafts',()=>{
 const fields=[field('name','string',{maxLength:3}),field('reference','reference')];const row={name:'Long name',reference:{id:'one'}};
 const validators={name:()=>['Business rule'],reference:(value,snapshot)=>{value.id='changed';snapshot.name='changed';return [];}};
 const errors=validateFields(fields,row,validators);assert.equal(errors.name.length,2);assert.equal(errors.reference,undefined);assert.deepEqual(row,{name:'Long name',reference:{id:'one'}});
});
test('custom validators can require optional fields based on another value',()=>{
 const fields=[field('email','email',{required:false})];
 assert.deepEqual(validateFields(fields,{email:'',notifications:true},{email:(_value,row)=>row.notifications?['Email is needed for notifications.']:[]}),{email:['Email is needed for notifications.']});
});
test('renderer change callbacks cannot mutate read-only or busy drafts and copy accepted values',async()=>{
 const {CrudEditor,RecordDraft}=await import('../dist/angular/fesm2022/bqatlas-angular.mjs');
 const draft=new RecordDraft();draft.initialize({name:'Original'});let allowed=false;let saving=false;
 const editor={descriptor:{fields:[field('name','string'),field('total','decimal',{readOnly:true})]},draft,canWrite:()=>allowed,loading:()=>false,task:{saving:()=>saving,dirty:{set:()=>{}}}};
 CrudEditor.prototype.change.call(editor,'name','Denied');assert.equal(draft.value().name,'Original');
 allowed=true;CrudEditor.prototype.change.call(editor,'total','999');assert.equal(draft.value().total,undefined);
 saving=true;CrudEditor.prototype.change.call(editor,'name','Busy');assert.equal(draft.value().name,'Original');
 saving=false;const value={text:'Accepted'};CrudEditor.prototype.change.call(editor,'name',value);value.text='Mutated';assert.equal(draft.value().name.text,'Accepted');
});

test('list defaults select and order known fields without changing form metadata',()=>{
 const fields=[field('name','string'),field('amount','decimal'),field('active','boolean')];const descriptor={fields};
 assert.deepEqual(selectListFields(descriptor,['active','name']),[fields[2],fields[0]]);assert.equal(descriptor.fields,fields);
 assert.throws(()=>selectListFields(descriptor,['missing']));assert.throws(()=>selectListFields(descriptor,['name','name']));assert.throws(()=>selectListFields(descriptor,[]));
});
