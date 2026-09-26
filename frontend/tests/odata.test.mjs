import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ODataResourceProvider} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
const options={fields:{id:{property:'Id',type:'string'},name:{property:'Name',type:'string'},active:{property:'Active',type:'boolean'},amount:{property:'Amount',type:'decimal'}},key:'id',searchFields:['name'],map:row=>({id:row.Id,name:row.Name})};
const request={page:0,pageSize:20,search:''};
test('OData escapes text literals, preserves exact decimals and appends stable key sorting',async()=>{
 let path;const provider=new ODataResourceProvider({request:async p=>{path=p;return {value:[{Id:'1',Name:'One'}],'@odata.count':1};}},'/odata/Customers',{},options);
 const page=await provider.query({...request,search:"O'Brien",sort:[{field:'name',direction:'desc'}],filters:[{field:'amount',operator:'eq',value:'9007199254740993.01'}]});
 const query=new URL(path,'https://app.example').searchParams;
 assert.equal(query.get('$orderby'),'Name desc,Id asc');assert.equal(query.get('$filter'),"Amount eq 9007199254740993.01 and (contains(Name,'O''Brien'))");assert.deepEqual(page.items,[{id:'1',name:'One'}]);
});
test('OData rejects untrusted fields, expression operators and invalid typed literals before transport',async()=>{
 const provider=new ODataResourceProvider({request:()=>assert.fail('must not send')},'/odata/Customers',{},options);
 for(const patch of [{page:-1},{pageSize:101},{sort:[{field:'Name desc',direction:'asc'}]},{filters:[{field:'__proto__',operator:'eq',value:'x'}]},{filters:[{field:'active',operator:'eq',value:'true or true'}]},{filters:[{field:'amount',operator:'eq',value:'1e10'}]},{filters:[{field:'name',operator:'execute',value:'x'}]}])await assert.rejects(provider.query({...request,...patch}));
});
test('OData follows bounded same-resource continuations and rejects external links',async()=>{
 const previous=globalThis.window;globalThis.window={location:{origin:'https://app.example'}};
 try {
  let calls=0;const provider=new ODataResourceProvider({request:async()=>++calls===1?{value:[{Id:'1'}],'@odata.count':2,'@odata.nextLink':'https://app.example/odata/Customers?$skip=1'}:{value:[{Id:'2'}]}},'/odata/Customers',{},options);
  assert.equal((await provider.query({...request,pageSize:2})).items.length,2);assert.equal(calls,2);
  const hostile=new ODataResourceProvider({request:async()=>({value:[{Id:'1'}],'@odata.count':2,'@odata.nextLink':'https://elsewhere.example/odata/Customers'})},'/odata/Customers',{},options);
  await assert.rejects(hostile.query({...request,pageSize:2}),/same resource/);
 } finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('OData delegates writes with the exact version and cancellation signal',async()=>{
 const signal=new AbortController().signal;const input={name:'Changed'};let received;
 const provider=new ODataResourceProvider({},'/odata/Customers',{update:async(...args)=>{received=args;return {data:input,version:'new'};}},options);
 assert.equal((await provider.update('one',input,'opaque',signal)).version,'new');assert.deepEqual(received,['one',input,'opaque',signal]);
});
test('OData negotiates exact JSON decimals and accepts only safe integer counts',async()=>{
 let accepted;const provider=new ODataResourceProvider({request:async(...args)=>{accepted=args[6];return {value:[{Id:'one',Amount:'90071992547409.0001'}],'@odata.count':'1'};}},'/odata/Customers',{}, {...options,map:row=>row});
 const page=await provider.query(request);assert.equal(accepted,'application/json;IEEE754Compatible=true');assert.equal(page.total,1);assert.equal(page.items[0].Amount,'90071992547409.0001');
 for(const count of ['9007199254740992','1.0','-1','1e2']){const invalid=new ODataResourceProvider({request:async()=>({value:[],'@odata.count':count})},'/odata/Customers',{},options);await assert.rejects(invalid.query(request),/exact count/);}
});
test('GUID key filters use typed literals and reject OData expressions',async()=>{
 let path;const provider=new ODataResourceProvider({request:async value=>{path=value;return {value:[],'@odata.count':0};}},'/odata/Customers',{}, {...options,fields:{...options.fields,id:{property:'Id',type:'guid'}}});
 const id='01234567-89ab-cdef-0123-456789abcdef';await provider.query({...request,filters:[{field:'id',operator:'eq',value:id}]});assert.equal(new URL(path,'https://app.example').searchParams.get('$filter'),`Id eq ${id}`);
 await assert.rejects(provider.query({...request,filters:[{field:'id',operator:'eq',value:id+' or true'}]}),/Invalid GUID/);
});
