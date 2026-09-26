import '@angular/compiler';
import assert from 'node:assert/strict';
import {AtlasApi,RestResourceProvider,ODataResourceProvider,ApiError} from '@bqatlas/angular';
const origin=new URL(process.env.BQATLAS_TEST_ORIGIN);
assert.equal(origin.hostname,'127.0.0.1');
const nativeFetch=globalThis.fetch,cookies=new Map();
// Only adapt Node's missing browser cookie jar and relative URLs. Requests use the real packaged API/providers.
globalThis.fetch=async(path,options={})=>{
 const url=new URL(path,origin);assert.equal(url.origin,origin.origin);
 const headers=new Headers(options.headers);if(cookies.size)headers.set('Cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
 const response=await nativeFetch(url,{...options,headers,redirect:'manual'});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}
 return response;
};
globalThis.window={location:{origin:origin.origin}};
assert.equal((await fetch('/test/login/writer')).status,200);
const api=new AtlasApi(),rest=new RestResourceProvider(api,'/api/v1/inventory/products');
const fields={id:{property:'Id',type:'guid'},sku:{property:'Sku',type:'string'},description:{property:'Description',type:'string'},unitPrice:{property:'UnitPrice',type:'decimal'},availableFrom:{property:'AvailableFrom',type:'date'},reorderLevel:{property:'ReorderLevel',type:'integer'},active:{property:'Active',type:'boolean'},category:{property:'Category',type:'string'}};
const odata=new ODataResourceProvider(api,'/odata/v1/inventory/Products',rest,{fields,key:'id',searchFields:['sku','description'],map:row=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('@')).map(([key,value])=>[key[0].toLowerCase()+key.slice(1),value]))});
const prefix='ADAPTER-'+crypto.randomUUID().slice(0,8);
const input=i=>({sku:`${prefix}-${String(i).padStart(2,'0')}`,description:"O'Brien product",contact:'supplier@example.com',active:true,reorderLevel:3,availableFrom:'2026-02-01',category:'Stock',unitPrice:i===52?'90071992547409.0001':'0.1001'});
const created=[];
for(let i=0;i<53;i++)created.push(await rest.create(input(i)));
const query={page:0,pageSize:100,search:"O'Brien",sort:[{field:'unitPrice',direction:'desc'},{field:'sku',direction:'asc'}],filters:[{field:'sku',operator:'startsWith',value:prefix},{field:'availableFrom',operator:'eq',value:'2026-02-01'},{field:'reorderLevel',operator:'eq',value:'3'},{field:'active',operator:'eq',value:'true'}]};
const a=await rest.query(query),b=await odata.query(query);
assert.equal(a.total,53);assert.equal(b.total,53);assert.equal(b.items.length,53);
assert.equal(typeof b.items[0].unitPrice,'string');assert.equal(b.items[0].unitPrice,'90071992547409.0001');
// OData and REST may format timestamp offsets or trailing decimal zeros differently; compare business values and stable order.
const business=rows=>rows.map(({id,sku,description,contact,active,reorderLevel,availableFrom,category,unitPrice})=>({id,sku,description,contact,active,reorderLevel,availableFrom,category,priceUnits:BigInt(unitPrice.split('.')[0])*10000n+BigInt((unitPrice.split('.')[1]??'').padEnd(4,'0'))}));
assert.deepEqual(business(b.items),business(a.items));
const byId=await odata.query({page:0,pageSize:25,search:'',filters:[{field:'id',operator:'eq',value:created[0].data.id}]});assert.equal(byId.total,1);assert.equal(byId.items[0].id,created[0].data.id);
const record=await odata.get(created[0].data.id);const saved=await odata.update(record.data.id,{...input(0),description:'Saved through shared REST write adapter'},record.version);
await assert.rejects(()=>odata.update(record.data.id,input(0),record.version),error=>error instanceof ApiError&&error.status===412);
await odata.delete(saved.data.id,saved.version);await assert.rejects(()=>rest.get(saved.data.id),error=>error instanceof ApiError&&error.status===404);
console.log('Actual REST/OData providers agree for 53 rows, continuation, typed filters, exact decimals, GUID keys and delegated writes.');
