/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AccessService } from '@foundation/shared/access';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { FullSpanRowDirective } from '@foundation/utils';
import { switchMap } from 'rxjs';

@Component({
	selector: 'lib-user-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		FullSpanRowDirective,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
	],
	templateUrl: './user-table.component.html',
	styleUrl: './user-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserTableComponent extends RepositoryTableComponent<User, UsersRepository> {
	private _accessService = inject(AccessService);

	constructor(
		private _repository: UsersRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType,
		@Attribute('bypass-acls') bypassAclsAttr: string | null
	) {
		const bypassAcls = bypassAclsAttr === '' || bypassAclsAttr === 'true';
		super(
			_repository,
			{
				orderingBy: { fieldName: 'time_created', direction: 'desc' },
				alwaysOnFilters: [],
				requestFn: (page, pageSize, filters, orderingBy, forceRequest) => _repository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, true, bypassAcls),
			},
			clickBehavior
		);
	}

	private _i18n_renameFirstSentence = this._translationService.prep('Give a new name to this user:');
	private _i18n_setPasswordPrompt = this._translationService.prep('Type a new password for this user:');
	private _i18n_setPasswordTitle = this._translationService.prep('Set password');
	private _i18n_passwordUpdated = this._translationService.prep('Password updated successfully.');
	private _i18n_passwordUpdateFailed = this._translationService.prep('Failed to update password.');
	private _i18n_passwordTooShort = this._translationService.prep('Password must contain at least 5 characters.');
	private _i18n_verifyEmailTitle = this._translationService.prep('Verify email');
	private _i18n_verifyEmailConfirm = this._translationService.prep('Mark this email as verified?');
	private _i18n_verifyEmailDone = this._translationService.prep('Email verified successfully.');
	private _i18n_verifyEmailFailed = this._translationService.prep('Unable to verify email.');
	private _i18n_verifyEmailButton = this._translationService.prep('Verify email');
	private _i18n_connectAsLinkCopied = this._translationService.prep('Connect-as link copied to clipboard.');
	private _i18n_connectAsLinkCopyFailed = this._translationService.prep('Failed to copy connect-as link.');
	public isAdmin = toSignal(this._accessService.checkAdmin$(), { initialValue: false });

	public renameFirstUser(user: User) {
		this._notificationService
			.prompt(this._i18n_renameFirstSentence(), undefined, {
				defaultValue: user.firstName ?? '',
			})
			.closed.subscribe((promptResult) => {
				if (!promptResult || !promptResult.value) return;
				console.log('You want to rename this user:', user, 'to', promptResult.value);

				this._repository.store
					.putObject$({ ...user, firstName: promptResult.value })
					.pipe(switchMap(() => this.paginator.refresh()))
					.subscribe();
			});
	}

	public promptSetPassword(user: User) {
		this._notificationService
			.prompt(this._i18n_setPasswordPrompt(), this._i18n_setPasswordTitle(), {
				inputPlaceholder: 'At least 5 characters',
			})
			.closed.subscribe((promptResult) => {
				const password = promptResult?.value?.trim();
				if (!password) return;

				if (password.length < 5) {
					this._notificationService.snackError(this._i18n_passwordTooShort());
					return;
				}

				this._repository.setUserPassword$(user.id, password).subscribe((response) => {
					if (response.error) {
						this._notificationService.snackError(response.error.description ?? this._i18n_passwordUpdateFailed(), response.error.title);
						return;
					}
					this._notificationService.snackSuccess(response.result?.message ?? this._i18n_passwordUpdated());
				});
			});
	}

	public confirmAndVerifyEmail(user: User) {
		if (user.emailVerified) return;

		this._notificationService
			.confirm(`${this._i18n_verifyEmailConfirm()}\n${user.email ?? ''}`, this._i18n_verifyEmailTitle(), {
				confirmButtonText: this._i18n_verifyEmailButton(),
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;

				this._repository.verifyUserEmail$(user.id).subscribe((response) => {
					if (response.error) {
						this._notificationService.snackWarning(response.error.description ?? this._i18n_verifyEmailFailed(), response.error.title);
						return;
					}
					this._notificationService.snackSuccess(response.result?.message ?? this._i18n_verifyEmailDone());
					this.paginator.refresh().subscribe();
				});
			});
	}

	public copyConnectAsLink(user: User) {
		this._repository.getConnectAsLink$(user.id).subscribe((connectAsLink) => {
			if (!connectAsLink) {
				this._notificationService.snackError(this._i18n_connectAsLinkCopyFailed());
				return;
			}

			navigator.clipboard
				.writeText(connectAsLink)
				.then(() => {
					this._notificationService.snackSuccess(this._i18n_connectAsLinkCopied());
				})
				.catch(() => {
					this._notificationService.snackError(this._i18n_connectAsLinkCopyFailed());
				});
		});
	}
}
