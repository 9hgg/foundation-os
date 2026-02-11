import { Component, inject } from '@angular/core';

import { AppConfigService } from '@foundation/app/config';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { NotificationDigestFrequency, EmailSubscriptionDetails, ThemeConfig } from '@foundation/users/models';
import { convertToUrl } from '@foundation/files/state';
import { validateEmail } from '@foundation/utils';
import { tap } from 'rxjs';

@Component({
	template: '',
	standalone: true,
	imports: [],
})
export class GenericProfilePageComponent {
	public usersRepository = inject(UsersRepository);
	public translationService = inject(TranslationService);
	protected _notificationService = inject(NotificationService);
	protected _requestService = inject(RequestService);
	protected _fileModals = inject(FileModals);
	protected _appConfig = inject(AppConfigService);

	public isEmailVerificationLoading = false;

	public convertToUrl = convertToUrl;

	patchCurrentProfile(data: { [key: string]: unknown }) {
		const currentProfile = this.usersRepository.currentProfile();
		if (!currentProfile) return;
		this._requestService
			.post$('/api/users/profile/update', data)
			.pipe(tap(() => this.usersRepository.refreshUsers()))
			.subscribe((response) => {
				console.log('[GenericProfilePage](patchCurrentProfile) response', response);
			});
	}

	public editProfileField(key: string, defaultValue?: string) {
		this._notificationService.prompt('Edit ' + key, defaultValue).closed.subscribe((promptResult) => {
			if (!promptResult) return;
			const newValue = promptResult.value;

			if (newValue == defaultValue) {
				return;
			}

			if (key === 'email') {
				if (validateEmail(promptResult.value)) {
					this._notificationService.warning('Contact the support to change your email address.', 'Not implemented yet');
				} else {
					this._notificationService.error('Invalid email address');
				}
				return;
			}

			this.patchCurrentProfile({ [key]: newValue });
		});
	}

	public processUploadedFiles(files: (EntityFile | undefined)[]) {
		const files_ = files.filter((f): f is EntityFile => !!f);
		if (files_.length == 0) return;
		const fileToUse = files_[0];
		this.patchCurrentProfile({ config: { profilePictureId: fileToUse.id } });
	}

	public useAnExistingPicture() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'image' }],
			})
			.closed.subscribe((result) => {
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					this.patchCurrentProfile({ config: { profilePictureId: fileToUse.id } });
				}
			});
	}

	public getDigestFrequencyDisplay(frequency: NotificationDigestFrequency): string {
		const frequencyMap: Record<NotificationDigestFrequency, string> = {
			never: 'Never',
			hourly: 'Every hour',
			daily: 'Daily',
			weekly: 'Weekly',
			monthly: 'Monthly',
		};
		return frequencyMap[frequency] || 'Never';
	}

	public editDigestFrequency(currentFrequency: NotificationDigestFrequency) {
		const frequencyOptions: Array<{ value: NotificationDigestFrequency; label: string; description: string }> = [
			{ value: 'never', label: 'Never', description: 'No email notifications' },
			{ value: 'hourly', label: 'Every hour', description: 'Receive notifications every hour' },
			{ value: 'daily', label: 'Daily', description: 'Receive a daily digest of notifications' },
			{ value: 'weekly', label: 'Weekly', description: 'Receive a weekly summary of notifications' },
			{ value: 'monthly', label: 'Monthly', description: 'Receive a monthly summary of notifications' },
		];

		this._notificationService.selectFromOptions(frequencyOptions, 'Email Notification Digest', 'Choose how often you would like to receive email digests of your notifications:', currentFrequency).closed.subscribe((result) => {
			if (!result) return;
			const newFrequency = result.value as NotificationDigestFrequency;
			if (newFrequency === currentFrequency) return;

			this.patchCurrentProfile({
				config: {
					notificationDigestFrequency: newFrequency,
				},
			});

			const selectedOption = frequencyOptions.find((opt) => opt.value === newFrequency);
			this._notificationService.success(`Email digest frequency updated to: ${selectedOption?.label || newFrequency}`);
		});
	}

	public getNewsletterEntries(subscriptions: Record<string, EmailSubscriptionDetails> | undefined): Array<{ key: string; value: EmailSubscriptionDetails }> {
		if (!subscriptions) return [];
		return Object.entries(subscriptions).map(([key, value]) => ({ key, value }));
	}

	public toggleNewsletterSubscription(newsletterKey: string, currentSubscription: EmailSubscriptionDetails) {
		const newSubscription: EmailSubscriptionDetails = {
			...currentSubscription,
			subscribed: !currentSubscription.subscribed,
			subscribedAt: !currentSubscription.subscribed ? new Date().toISOString() : currentSubscription.subscribedAt,
		};

		const currentSubscriptions = this.usersRepository.currentProfile()?.config.newsletterSubscriptions || {};
		const updatedSubscriptions = {
			...currentSubscriptions,
			[newsletterKey]: newSubscription,
		};

		this.patchCurrentProfile({
			config: {
				newsletterSubscriptions: updatedSubscriptions,
			},
		});

		const action = newSubscription.subscribed ? 'subscribed to' : 'unsubscribed from';
		this._notificationService.success(`Successfully ${action} ${newsletterKey} newsletter`);
	}

	public sendEmailVerification() {
		if (this.isEmailVerificationLoading) return;
		this.isEmailVerificationLoading = true;
		this._requestService
			.post$<{ message: string; email: string }>('/api/users/email/send-verification', {}, undefined)
			.pipe(
				tap((response) => {
					this.isEmailVerificationLoading = false;
					if (response.error) {
						this._notificationService.error(response.error.title, response.error.description || 'Failed to send verification email');
					} else if (response.result) {
						this._notificationService.success('Verification email sent!', `A verification email has been sent to ${response.result.email}. Please check your inbox and click the verification link.`);
					}
				})
			)
			.subscribe();
	}

	public editThemeMode(currentMode: 'light' | 'dark' | 'system' = 'system') {
		const options = [
			{ value: 'system', label: 'Auto (System)', description: 'Follows your system settings' },
			{ value: 'light', label: 'Light', description: 'Always use light theme' },
			{ value: 'dark', label: 'Dark', description: 'Always use dark theme' },
		];

		this._notificationService.selectFromOptions(options, 'Theme Mode', 'Choose your preferred theme mode:', currentMode).closed.subscribe((result) => {
			if (!result) return;
			const newMode = result.value as 'light' | 'dark' | 'system';
			if (newMode === currentMode) return;

			const currentTheme = this.usersRepository.currentProfile()?.config.theme || {};
			this.patchCurrentProfile({ config: { theme: { ...currentTheme, mode: newMode } } });
			this._notificationService.success(`Theme mode updated to: ${result.value}`);
		});
	}

	public editThemeLight(currentTheme: string = 'light') {
		const themes = this._appConfig.config$_?.environment?.availableThemes || ['light', 'dark'];
		const options = themes.map((t: string) => ({ value: t, label: t, description: '' }));

		this._notificationService.selectFromOptions(options, 'Light Theme', 'Choose your preferred light theme:', currentTheme).closed.subscribe((result) => {
			if (!result) return;
			const newTheme = result.value;
			if (newTheme === currentTheme) return;

			const currentThemeObj = this.usersRepository.currentProfile()?.config.theme || {};
			this.patchCurrentProfile({ config: { theme: { ...currentThemeObj, light: newTheme } } });
			this._notificationService.success(`Light theme updated to: ${newTheme}`);
		});
	}

	public editThemeDark(currentTheme: string = 'dark') {
		const themes = this._appConfig.config$_?.environment?.availableThemes || ['light', 'dark'];
		const options = themes.map((t: string) => ({ value: t, label: t, description: '' }));

		this._notificationService.selectFromOptions(options, 'Dark Theme', 'Choose your preferred dark theme:', currentTheme).closed.subscribe((result) => {
			if (!result) return;
			const newTheme = result.value;
			if (newTheme === currentTheme) return;

			const currentThemeObj = this.usersRepository.currentProfile()?.config.theme || {};
			this.patchCurrentProfile({ config: { theme: { ...currentThemeObj, dark: newTheme } } });
			this._notificationService.success(`Dark theme updated to: ${newTheme}`);
		});
	}

	public onThemeChange(changes: Partial<ThemeConfig>) {
		const currentTheme = this.usersRepository.currentProfile()?.config.theme || {};
		this.patchCurrentProfile({ config: { theme: { ...currentTheme, ...changes } } });
	}
}
