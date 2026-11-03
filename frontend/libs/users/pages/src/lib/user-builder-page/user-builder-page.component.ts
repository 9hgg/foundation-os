import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { ClipboardService, NotificationService } from '@foundation/notification';
import { Flag, FlagAttribution } from '@foundation/flags/models';
import { FlagModals } from '@foundation/flags/modals';
import { FlagAttributionsRepository, FlagsRepository } from '@foundation/flags/state';
import { RequestService } from '@foundation/network/services';
// `Subscription` is rxjs's in this file, so the model comes in under its own name.
import { Subscription as UserSubscription } from '@foundation/subscriptions/models';
import { Article } from '@foundation/articles/models';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { TranslateDirective, TranslatePipe, TranslationService } from '@foundation/translations/services';
import { PatchableItem } from '@foundation/utils';
import { combineLatest, Subscription } from 'rxjs';

export interface FlagAttributionWithFlag {
	attribution: FlagAttribution;
	flag: Flag | null;
}

@Component({
	selector: 'lib-user-builder-page',
	standalone: true,
	imports: [CommonModule, DatePipe, FormsModule, RouterModule, CdkMenuModule, PortalModule, TranslateDirective, TranslatePipe],
	templateUrl: './user-builder-page.component.html',
	styleUrls: ['./user-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _usersRepository = inject(UsersRepository);
	private _appConfig = inject(AppConfigService);
	private _flagAttributionsRepository = inject(FlagAttributionsRepository);
	private _flagsRepository = inject(FlagsRepository);
	private _flagModals = inject(FlagModals);
	public digestFrequencies: Array<'never' | 'hourly' | 'daily' | 'weekly' | 'monthly'> = ['never', 'hourly', 'daily', 'weekly', 'monthly'];
	public themeModes: Array<'light' | 'dark' | 'system'> = ['system', 'light', 'dark'];
	public languages = [
		{ code: 'en', name: 'English' },
		{ code: 'fr', name: 'Francais' },
		{ code: 'es', name: 'Espanol' },
		{ code: 'it', name: 'Italiano' },
		{ code: 'de', name: 'Deutsch' },
	];

	private _requestService = inject(RequestService);
	private _clipboardService = inject(ClipboardService);
	private _translationService = inject(TranslationService);
	private _router = inject(Router);
	private _route = inject(ActivatedRoute);

	public userId = input<string | null>(null);

	/** Bound to the `activeTab` query param, so a tab is a link the next admin can be sent. */
	activeTab = model<string>();

	/** What this person asked us, and what they pay: the two things you open an account to check. */
	protected readonly tickets = signal<Article[]>([]);
	protected readonly subscriptions = signal<UserSubscription[]>([]);
	protected readonly isLoadingTab = signal(false);

	protected readonly tabs = [
		{ key: 'profile', label: 'Profile' },
		{ key: 'tickets', label: 'Tickets' },
		{ key: 'subscriptions', label: 'Subscriptions' },
	];
	patchableUser = new PatchableItem<User>(
		this.userId,
		(id) => this._usersRepository.getUserByIdAsAdmin$(id),
		(id, patch) => this._saveUser(id, patch)
	);

	public availableThemes = computed(() => this._appConfig.config$_.environment.availableThemes || ['light', 'dark']);

	protected readonly flagAttributions = signal<FlagAttributionWithFlag[]>([]);

	constructor() {
		effect(() => {
			const activeTab = this.activeTab();
			if (activeTab === undefined) {
				this.activeTab.set('profile');
				return;
			}
			this._router.navigate([], { relativeTo: this._route, queryParams: { activeTab }, queryParamsHandling: 'merge', replaceUrl: true, preserveFragment: true });
		});

		effect(() => {
			const userId = this.userId();
			const activeTab = this.activeTab();
			if (!userId) return;
			if (activeTab === 'tickets') this._loadTickets(userId);
			if (activeTab === 'subscriptions') this._loadSubscriptions(userId);
		});

		effect(() => {
			this._refreshFlagAttributions(this.userId());
		});
	}

	private _flagsSubscription?: Subscription;

	private _i18n_idCopied = this._translationService.prep('User id copied to clipboard.');
	private _i18n_connectAsCopied = this._translationService.prep('Connect-as link copied to clipboard.');
	private _i18n_connectAsFailed = this._translationService.prep('Failed to copy the connect-as link.');

	/** Sign in as this person, from the account you are already looking at. */
	public copyConnectAsLink(userId: string) {
		this._usersRepository.getConnectAsLink$(userId).subscribe((connectAsLink) => {
			if (!connectAsLink) {
				this.notificationService.snackError(this._i18n_connectAsFailed());
				return;
			}
			this._clipboardService.copy(connectAsLink, { successMessage: this._i18n_connectAsCopied() }).subscribe();
		});
	}

	/** The badge shows the first eight characters; copying gives the whole id. */
	public copyUserId(userId: string) {
		this._clipboardService.copy(userId, { successMessage: this._i18n_idCopied() }).subscribe();
	}

	/** Admin reads: bypass_acls is refused by the backend to anyone who is not an admin. */
	private _loadTickets(userId: string) {
		this.isLoadingTab.set(true);
		this._requestService
			.getObjectList$<Article>('/api/articles', {
				filters: [`author_id:${userId}:exact`],
				ordering_by: 'time_created:desc',
				page_size: 20,
				bypass_acls: true,
			})
			.subscribe((response) => {
				this.tickets.set(response.result?.data ?? []);
				this.isLoadingTab.set(false);
			});
	}

	private _loadSubscriptions(userId: string) {
		this.isLoadingTab.set(true);
		this._requestService
			.getObjectList$<UserSubscription>('/api/subscriptions', {
				filters: [`beneficiary_id:${userId}:exact`],
				ordering_by: 'time_created:desc',
				page_size: 20,
				bypass_acls: true,
			})
			.subscribe((response) => {
				this.subscriptions.set(response.result?.data ?? []);
				this.isLoadingTab.set(false);
			});
	}

	private _refreshFlagAttributions(userId: string | null) {
		if (!userId) {
			this.flagAttributions.set([]);
			return;
		}
		this._flagAttributionsRepository.listForUser$(userId).subscribe((response) => {
			const attributions = response.result?.data ?? [];
			if (attributions.length === 0) {
				this.flagAttributions.set([]);
				return;
			}
			// Stay subscribed: these subjects emit null first and the flag once it lands, so sampling
			// the first emission would leave the list showing raw ids.
			this._flagsSubscription?.unsubscribe();
			this._flagsSubscription = combineLatest(
				attributions.map((attribution) => this._flagsRepository.store.getObjectByIdPullOnce$$$(attribution.flagId).$)
			).subscribe((flags) => {
				this.flagAttributions.set(attributions.map((attribution, index) => ({ attribution, flag: flags[index] ?? null })));
			});
		});
	}

	openFlagSelectionForAttribution() {
		const userId = this.userId();
		if (!userId) return;

		this._flagModals
			.openFlagsSelectionDialog({ selectionConstraints: { single: true, maxFlags: 1, minFlags: 1 } })
			.closed.subscribe((result) => {
				const flag = result?.flags[0];
				if (!flag) return;
				this._flagAttributionsRepository.attribute$(flag.id, userId).subscribe(() => this._refreshFlagAttributions(userId));
			});
	}

	toggleFlagAttributionEnabled(attribution: FlagAttribution) {
		const userId = this.userId();
		this._flagAttributionsRepository.setEnabled$(attribution, !attribution.enabled).subscribe(() => this._refreshFlagAttributions(userId));
	}

	removeFlagAttribution(attribution: FlagAttribution) {
		const userId = this.userId();
		this._flagAttributionsRepository.remove$(attribution.id).subscribe(() => this._refreshFlagAttributions(userId));
	}

	confirmAndVerifyEmail(user: User) {
		if (user.emailVerified) return;

		this.notificationService
			.confirm(`Mark this email as verified?\n${user.email ?? ''}`, 'Verify email', {
				confirmButtonText: 'Verify email',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;

				this._usersRepository.verifyUserEmail$(user.id).subscribe((response) => {
					if (response.error) {
						this.notificationService.snackWarning(response.error.description ?? 'Unable to verify email.', response.error.title);
						return;
					}

					this.notificationService.snackSuccess(response.result?.message ?? 'Email verified successfully.');
					this.patchableUser.item$$$.next(user.id);
				});
			});
	}

	private _saveUser(userId: string, payload: Partial<User>) {
		this._usersRepository.updateUserAsAdmin$(userId, payload).subscribe((response) => {
			if (response.error) {
				this.notificationService.snackWarning(response.error.description ?? response.error.title, response.error.title);
				return;
			}
			this.patchableUser.item$$$.next(userId);
		});
	}

	// Raw JSON editing: a separate one-shot save, not routed through PatchableItem's
	// per-field patch since it replaces the whole object at once. Reuses the same
	// admin/update endpoint, so the server-side editable-fields whitelist still applies
	// (e.g. id/timeCreated edits are rejected with a clear error, not silently dropped).
	protected readonly jsonEditMode = signal(false);
	protected readonly jsonEditText = signal('');
	protected readonly jsonEditError = computed<string | null>(() => {
		try {
			JSON.parse(this.jsonEditText());
			return null;
		} catch (error) {
			return error instanceof Error ? error.message : 'Invalid JSON';
		}
	});

	protected enterJsonEditMode(user: User) {
		this.jsonEditText.set(JSON.stringify(user, null, 2));
		this.jsonEditMode.set(true);
	}

	protected cancelJsonEdit() {
		this.jsonEditMode.set(false);
	}

	protected saveJsonEdit(userId: string) {
		if (this.jsonEditError()) return;
		const parsed = JSON.parse(this.jsonEditText());
		this._usersRepository.updateUserAsAdmin$(userId, parsed).subscribe((response) => {
			if (response.error) {
				this.notificationService.snackWarning(response.error.description ?? response.error.title, response.error.title);
				return;
			}
			this.patchableUser.item$$$.next(userId);
			this.jsonEditMode.set(false);
		});
	}
}
