import '@angular/compiler';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {quoteTotals,quoteInput,newQuote,validateQuote,appendCatalogProduct} from '../projects/erp/src/sales/quote-model.ts';
import {parseDecimalUnits,formatDecimalUnits} from '../projects/contracts/dist/index.js';
import {RecordDraft} from '../dist/angular/fesm2022/bqatlas-angular.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../../contracts/v1/fixtures/quote-totals.json',import.meta.url),'utf8'));
for(const fixture of fixtures)test(`portable quote fixture: ${fixture.name}`,()=>assert.deepEqual(quoteTotals(fixture.lines),{lines:fixture.lineTotals,total:fixture.total}));
test('decimal text rejects grouping, exponent, excess precision, signs and out-of-range values',()=>{
 for(const value of ['1e3','1,000','01','+1','-1',' 1','1.','0.0001'])assert.equal(parseDecimalUnits(value,3),null);
 assert.equal(parseDecimalUnits('1000000.001',3,'1000000'),null);assert.equal(formatDecimalUnits(9007199254740993n,2),'90071992547409.93');
});
test('two new quote drafts keep separate line arrays and IDs',()=>{
 const a=new RecordDraft(),b=new RecordDraft();a.initialize(newQuote());b.initialize(newQuote());
 a.change('lines',a.value().lines.map(line=>({...line,description:'Only A',unitPrice:'10.005'})));
 assert.equal(b.value().lines[0].description,'');assert.notEqual(a.value().lines[0].id,b.value().lines[0].id);assert.equal(quoteTotals(a.value().lines).total,'10.01');
});
test('quote writes contain only editable input and preserve decimal strings',()=>{
 const value=newQuote();value.lines[0].unitPrice='12.3456';const input=quoteInput(value);
 assert.equal(input.lines[0].unitPrice,'12.3456');assert.equal('total' in input,false);assert.equal('status' in input,false);assert.equal('total' in input.lines[0],false);
});

test('quote validation catches invalid headers and lines before JSON binding',()=>{
 const value=newQuote();value.date='2026-02-30';value.lines[0].quantity='0';value.lines[0].unitPrice='1e3';
 assert.deepEqual(Object.keys(validateQuote(value)),['customerId','date','lines[0].description','lines[0].quantity','lines[0].unitPrice']);
 value.customerId=crypto.randomUUID();value.date='2026-09-26';value.lines[0]={...value.lines[0],description:'Widget',quantity:'2.125',unitPrice:'12.3456'};
 assert.deepEqual(validateQuote(value),{});
 value.lines=[];assert.deepEqual(Object.keys(validateQuote(value)),['lines']);
});

test('catalog selection snapshots exact prices and preserves existing quote lines',()=>{
 const quote=newQuote();const product={name:'Consulting',unitPrice:'125.1234',currency:'USD',active:true};
 const lines=appendCatalogProduct(quote,product);assert.equal(lines.length,1);assert.equal(lines[0].unitPrice,'125.1234');assert.equal(quote.lines[0].description,'');
 product.name='Changed catalog';product.unitPrice='999';assert.equal(lines[0].description,'Consulting');assert.equal(lines[0].unitPrice,'125.1234');
 const next=appendCatalogProduct({...quote,lines},product);assert.equal(next.length,2);assert.deepEqual(next[0],lines[0]);assert.notEqual(next[0].id,next[1].id);
});
test('catalog selection rejects inactive, wrong-currency, invalid-price and over-capacity products',()=>{
 const quote=newQuote(),product={name:'Consulting',unitPrice:'125.1234',currency:'USD',active:true};
 assert.throws(()=>appendCatalogProduct(quote,{...product,active:false}),/active product/);
 assert.throws(()=>appendCatalogProduct(quote,{...product,currency:'EUR'}),/quote currency/);
 assert.throws(()=>appendCatalogProduct(quote,{...product,unitPrice:'1e3'}),/invalid unit price/);
 assert.throws(()=>appendCatalogProduct({...quote,lines:Array.from({length:100},()=>({...quote.lines[0]}))},product),/100 lines/);
});
