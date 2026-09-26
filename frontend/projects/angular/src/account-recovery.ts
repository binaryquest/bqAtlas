import {ChangeDetectionStrategy,Component,inject,input,output,signal,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AtlasButton,AtlasInput} from '@bqatlas/ui';
import {AtlasApi} from './api';
import {AtlasSession} from './session';

export interface AccountRecoveryLink {action:'reset'|'confirm';userId:string;token:string;}
/** Consume once before application startup. Never retain recovery credentials in browser history. */
export function consumeAccountRecoveryLink(location:Pick<Location,'href'>,history:Pick<History,'state'|'replaceState'>):AccountRecoveryLink|null {
  const url=new URL(location.href);
  const action=url.searchParams.get('accountAction');
  const userId=url.searchParams.get('userId');
  const token=url.searchParams.get('token');
  if(['accountAction','userId','token'].some(key=>url.searchParams.has(key))){
    for(const key of ['accountAction','userId','token'])url.searchParams.delete(key);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
  return (action==='reset'||action==='confirm')&&userId&&userId.length<=256&&token&&token.length<=8192?{action,userId,token}:null;
}
@Component({
  selector:'bqatlas-account-recovery',imports:[FormsModule,AtlasButton,AtlasInput],changeDetection:ChangeDetectionStrategy.OnPush,
  styles:`fieldset{border:0;padding:0;margin:0}button{margin-top:.75rem}`,
  template:`<section aria-label="Account recovery">
    <h2>{{link()?.action==='confirm'?'Confirm your email':link()?'Reset your password':mode()==='confirm'?'Request a confirmation email':'Forgot your password?'}}</h2>
    @if(message()){<p role="status">{{message()}}</p>}
    @if(error()){<p role="alert">{{error()}}</p>}
    @if(!done()){
      <form (ngSubmit)="submit()"><fieldset [disabled]="busy()">
        @if(!link()){
          <label>Email address<input atlasInput type="email" autocomplete="email" name="recoveryEmail" required maxlength="254" [(ngModel)]="email" /></label>
        } @else if(link()?.action==='reset'){
          <label>New password<input atlasInput type="password" autocomplete="new-password" name="newPassword" required minlength="12" maxlength="1024" [(ngModel)]="password" /></label>
          <label>Confirm password<input atlasInput type="password" autocomplete="new-password" name="confirmPassword" required [(ngModel)]="confirmation" /></label>
          <p>Use at least 12 characters, including uppercase, lowercase, a number and a symbol.</p>
        } @else {<p>Confirm ownership of the email address associated with this link.</p>}
        <button atlasButton variant="primary" type="submit">{{busy()?'Please wait…':link()?.action==='confirm'?'Confirm email':link()?'Reset password':'Send email'}}</button>
      </fieldset></form>
      @if(!link()) {<button atlasButton type="button" [disabled]="busy()" (click)="toggleMode()">{{mode()==='reset'?'Need a confirmation email?':'Forgot password?'}}</button>}
    }
    <button atlasButton type="button" [disabled]="busy()" (click)="close()">Return to sign in</button>
  </section>`,
})
export class AtlasAccountRecovery implements OnDestroy {
  private readonly api=inject(AtlasApi);
  private readonly session=inject(AtlasSession);
  readonly link=input<AccountRecoveryLink|null>(null);
  readonly closed=output<void>();
  readonly consumed=output<void>();
  readonly mode=signal<'reset'|'confirm'>('reset');
  readonly busy=signal(false);readonly done=signal(false);readonly message=signal('');readonly error=signal('');
  email='';password='';confirmation='';
  private readonly abort=new AbortController();
  ngOnDestroy(){this.abort.abort();this.clear();}
  close(){if(this.busy())return;this.clear();this.closed.emit();}
  toggleMode(){this.mode.update(mode=>mode==='reset'?'confirm':'reset');this.message.set('');this.error.set('');}
  private clear(){this.password='';this.confirmation='';}
  async submit(){
    if(this.busy()||this.done())return;
    const link=this.link();
    this.error.set('');
    if(link?.action==='reset'&&(!this.password||this.password!==this.confirmation)){this.error.set('Enter matching new passwords.');return;}
    if(!link&&!this.email.trim()){this.error.set('Enter your email address.');return;}
    this.busy.set(true);
    try{
      if(link){
        await this.api.request(link.action==='reset'?'/auth/reset-password':'/auth/confirm-email','POST',link.action==='reset'?{userId:link.userId,token:link.token,newPassword:this.password}:{userId:link.userId,token:link.token},this.abort.signal);
        if(link.action==='reset')this.session.clear();
        this.consumed.emit();
        this.message.set(link.action==='reset'?'Your password has been reset. Sign in with your new password.':'Your email has been confirmed. You can now sign in.');
      }else{
        await this.api.request(this.mode()==='reset'?'/auth/request-password-reset':'/auth/request-confirmation','POST',{email:this.email.trim()},this.abort.signal);
        this.message.set('If the account is eligible, an email has been sent. Check your inbox.');
      }
      this.done.set(true);
    }catch(error){if(!this.abort.signal.aborted)this.error.set(error instanceof Error?error.message:'Unable to complete this request.');}
    finally{this.clear();this.busy.set(false);}
  }
}
