import {ChangeDetectionStrategy,Component,inject,output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AtlasButton,AtlasInput,WorkspaceService} from '@bqatlas/ui';
import {AtlasApi,ApiError} from './api';
import {AtlasSession} from './session';
@Component({
  selector:'bqatlas-password-change',imports:[FormsModule,AtlasButton,AtlasInput],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<section class="bqatlas-view" aria-label="Change password"><h2>Change password</h2>
    <p>You will sign in again after changing your password.</p>
    @if(error()){<p role="alert">{{error()}}</p>}
    <form (ngSubmit)="submit()" class="bqatlas-form"><fieldset [disabled]="busy()">
      <label>Current password<input atlasInput type="password" autocomplete="current-password" name="currentPassword" required [(ngModel)]="currentPassword" /></label>
      <label>New password<input atlasInput type="password" autocomplete="new-password" name="newPassword" required minlength="12" [(ngModel)]="newPassword" /></label>
      <label>Confirm new password<input atlasInput type="password" autocomplete="new-password" name="confirmPassword" required [(ngModel)]="confirmation" /></label>
      <p>Use at least 12 characters, including uppercase, lowercase, a number and a symbol.</p>
      <button atlasButton type="submit" variant="primary">Change password</button>
      <button atlasButton type="button" (click)="cancel()">Cancel</button>
    </fieldset></form></section>`,
})
export class AtlasPasswordChange {
  private readonly api=inject(AtlasApi);
  private readonly session=inject(AtlasSession);
  private readonly workspace=inject(WorkspaceService);
  readonly closed=output<void>();
  readonly busy=signal(false);readonly error=signal('');
  currentPassword='';newPassword='';confirmation='';
  cancel(){this.clear();this.closed.emit();}
  private clear(){this.currentPassword='';this.newPassword='';this.confirmation='';}
  async submit(){
    if(this.busy())return;
    if(this.session.info()?.authMode!=='local'||!this.session.authenticated()){this.error.set('Password management is handled by your identity provider.');return;}
    if(this.workspace.hasPendingWork()){this.error.set('Save or close your unsaved work before changing your password.');return;}
    if(!this.currentPassword||!this.newPassword||this.newPassword!==this.confirmation){this.error.set('Enter your current password and matching new passwords.');return;}
    this.busy.set(true);this.error.set('');
    try{
      await this.api.request('/auth/change-password','POST',{currentPassword:this.currentPassword,newPassword:this.newPassword});
      this.clear();this.closed.emit();this.session.clear();await this.session.refresh();
    }catch(error){this.error.set(error instanceof ApiError?Object.values(error.problem.errors??{}).flat().join(' ')||error.message:error instanceof Error?error.message:'Unable to change password.');}
    finally{this.clear();this.busy.set(false);}
  }
}
