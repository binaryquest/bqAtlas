import {ChangeDetectionStrategy, Component, ViewEncapsulation, effect, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ATLAS_TASK, AtlasButton, AtlasInput} from '@bqatlas/ui';
import {CrudWorkspace} from '@bqatlas/angular';
import {EditingExamples} from './editing-examples';
import {PurchaseOrderDemo} from './purchase-order-demo';
import {SelectionEntryExamples} from './selection-entry-examples';
import {ErpControlExamples} from './erp-control-examples';
import {CollectionExamples} from './collection-examples';
import {BusinessExamples} from './business-examples';
@Component({
  selector:'app-showcase',
  imports:[FormsModule,AtlasButton,AtlasInput,EditingExamples,SelectionEntryExamples,ErpControlExamples,CollectionExamples,BusinessExamples],
  providers:[PurchaseOrderDemo],
  changeDetection:ChangeDetectionStrategy.OnPush,
  encapsulation:ViewEncapsulation.None,
  styleUrl:'./showcase.css',
  template:`<section class="showcase">
    <header class="showcase-heading"><div><span class="showcase-eyebrow">ATLAS EXAMPLES</span><h2>Forms & controls</h2><p>Explore real controls in everyday business workflows.</p></div><span class="showcase-badge">Sample workspace</span></header>
    <nav class="showcase-tabs" aria-label="Showcase examples">
      @for(item of sections;track item.id){<button atlasButton [attr.aria-pressed]="section()===item.id" (click)="section.set(item.id)">{{item.title}}</button>}
    </nav>
    <p class="showcase-notice">Control demos use local sample data. Changes stay in this window and reset when it closes. The CRUD links open your application's real records.</p>
    <div class="showcase-content">
      <section [hidden]="section()!=='overview'" aria-label="Example guide">
        <div class="showcase-cards">
          @for(item of sections.slice(1);track item.id){<button class="showcase-card" (click)="section.set(item.id)"><strong>{{item.title}}</strong><span>{{item.description}}</span><small>Explore example →</small></button>}
        </div>
      </section>
      <section [hidden]="section()!=='crud'" aria-label="CRUD examples">
        <div class="lab-section-intro"><div><h3>From a simple record to a full aggregate</h3><p>These views use the actual backend, permissions, validation and optimistic concurrency.</p></div></div>
        <div class="showcase-cards">
          @for(item of crud.menus();track item.resource){<button class="showcase-card" (click)="crud.openList(item.resource)"><strong>{{item.title}}</strong><span>{{item.resource==='sales.quotes'?'Header and child lines, remote customer lookup, exact decimal totals and submit workflow.':'Metadata-driven CRUD: create, edit, filter, validate and delete records.'}}</span><small>Open real records →</small></button>}
        </div>
        @if(!crud.menus().length){<p>No CRUD views are available for your account.</p>}
      </section>
      <demo-editing [hidden]="section()!=='master'" />
      <demo-selection-entry [hidden]="section()!=='inputs'" />
      <demo-erp-controls [hidden]="section()!=='lookup'" />
      <demo-collections [hidden]="section()!=='tables'" />
      <demo-business [hidden]="section()!=='business'" />
      <section [hidden]="section()!=='layouts'" aria-label="Complex form layouts">
        <div class="lab-section-intro"><div><h3>Supplier onboarding</h3><p>A responsive, sectioned form with accordions, grouped fields and a summary alongside it.</p></div></div>
        <form class="showcase-layout" (ngSubmit)="layoutMessage.set('Sample profile reviewed. Nothing was sent to a server.')">
          <div class="showcase-accordions">
            <details open><summary>01 · Company details</summary><div class="form-grid">
              <label>Company name<input atlasInput required name="company" [(ngModel)]="company" /></label>
              <label>Registration number<input atlasInput name="registration" [(ngModel)]="registration" /></label>
              <label>Contact email<input atlasInput required type="email" name="contact" [(ngModel)]="contact" /></label>
              <label>Phone<input atlasInput type="tel" name="phone" [(ngModel)]="phone" /></label>
            </div></details>
            <details open><summary>02 · Delivery & billing</summary><div class="form-grid">
              <label class="wide">Street address<input atlasInput name="street" [(ngModel)]="street" /></label>
              <label>City<input atlasInput name="city" [(ngModel)]="city" /></label>
              <label>Postal code<input atlasInput name="postcode" [(ngModel)]="postcode" /></label>
              <label>Payment terms<select atlasInput name="terms" [(ngModel)]="terms"><option>Net 30</option><option>Net 60</option><option>Due on receipt</option></select></label>
              <label>Currency<select atlasInput name="currency" [(ngModel)]="currency"><option>USD</option><option>EUR</option><option>BDT</option></select></label>
            </div></details>
            <details><summary>03 · Internal notes</summary><label class="showcase-notes">Notes<textarea atlasInput rows="4" name="notes" [(ngModel)]="notes"></textarea></label></details>
          </div>
          <aside class="showcase-summary"><span class="showcase-eyebrow">LIVE SUMMARY</span><h3>{{company || 'New supplier'}}</h3><p>{{contact || 'Add a contact email'}}</p><dl><dt>Payment</dt><dd>{{terms}}</dd><dt>Currency</dt><dd>{{currency}}</dd><dt>Location</dt><dd>{{city || 'Not provided'}}</dd></dl><button atlasButton variant="primary" type="submit">Review sample</button><p role="status">{{layoutMessage()}}</p></aside>
        </form>
      </section>
    </div>
  </section>`,
})
export class Showcase {
  readonly crud=inject(CrudWorkspace);
  readonly store=inject(PurchaseOrderDemo);
  readonly task=inject(ATLAS_TASK);
  readonly section=signal('overview');
  readonly layoutMessage=signal('');
  company='Northstar Supply';registration='SUP-2048';contact='hello@example.test';phone='';street='24 Market Street';city='Dhaka';postcode='1208';terms='Net 30';currency='USD';notes='';
  readonly sections=[
    {id:'overview',title:'Overview',description:''},
    {id:'master',title:'Master / child',description:'Purchase orders with editable lines, totals, local save and failed-save recovery.'},
    {id:'crud',title:'CRUD forms',description:'Open the real customer CRUD and Sales quote aggregate screens.'},
    {id:'layouts',title:'Form layouts',description:'Supplier onboarding with accordions, grouped fields and a live summary.'},
    {id:'lookup',title:'Multi-column lookup',description:'Compare code, name, location and balance before choosing a customer.'},
    {id:'inputs',title:'Selection & inputs',description:'Radio, checkboxes, multi-select, autocomplete, dates and decimal entry.'},
    {id:'tables',title:'Advanced tables',description:'Column filters, multi-sort, resizing, pinning, selection, row details and paging.'},
    {id:'business',title:'Business panels',description:'Property sheets, totals, activity, attachments and saved filter views.'},
  ];
  constructor(){
    this.task.lifecycle.save=()=>this.store.save();
    effect(()=>this.task.dirty.set(this.store.dirty()));
  }
}
