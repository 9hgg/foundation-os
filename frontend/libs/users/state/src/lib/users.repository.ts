import { AppConfigService } from '@foundation/app/config';
import { AuthTokensRepository } from '@foundation/auth/state';
import { convertToUrl } from '@foundation/files/state';
import { GenericRepository } from '@foundation/table/state';
import { User } from '@foundation/users/models';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { Injectable, effect, inject, signal } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { Observable, combineLatest, debounceTime, map, of, switchMap, take, tap } from 'rxjs';

export interface UserProps {
	currentUser: null | User;
	/**
	 * List of User that the user can claim to connect as.
	 * Different from all the tokens available in the store (an admin could have much more).
	 */
	availableUsers: User[];
}

export const INITIAL_USERS: User[] = [];

export const DEFAULT_USER_PROPS: UserProps = {
	currentUser: null,
	availableUsers: [],
};

const DEBUG = false;

@Injectable({ providedIn: 'root' })
export class UsersRepository extends GenericRepository<User> {
	private _authTokensRepository = inject(AuthTokensRepository);
	private _appConfigService = inject(AppConfigService);

	public connectedUsers$$$ = new BehaviorSubjectReplayed<{ user: User; authToken: string }[]>([]);
	public currentProfile$$$ = new BehaviorSubjectReplayed<User | null>(null);
	public currentProfile = signal<User | null>(null);

	public userIdsToDetails = signal<{
		[userId: string]:
			| {
					avatarUrl: string | null;
					publicName: string | null;
			  }
			| undefined;
	}>({});

	constructor() {
		super('user');

		// use auth tokens to fetch users data
		this._authTokensRepository.authTokenProps$$$
			.pipe(
				switchMap((authTokenProps) => this.getUsersByTokens$(authTokenProps.availableAuthTokens.map((authToken) => authToken.token))),
				tap((connectedUsers) => this.connectedUsers$$$.next(connectedUsers))
			)
			.subscribe();

		// set current user (signal and behavior subject)
		combineLatest({
			users: this.connectedUsers$$$.$,
			currentUserId: this._authTokensRepository.authTokenProps$$$.pipe(map((atp) => atp.currentAuthToken?.userId)),
		})
			.pipe(
				map((d) => {
					const u = d.users.find((u) => u.user.id == d.currentUserId);
					return u?.user ?? null;
				}),
				tap((user) => {
					this.currentProfile$$$.next(user);
					this.currentProfile.set(user);
				})
			)
			.subscribe();

		// fetch user details
		this._usersDetailsToFetch$$$
			.pipe(
				debounceTime(100),
				tap((userIds) => {
					this._fetchUsersDetails(userIds);
				})
			)
			.subscribe();

		// set user sentry
		effect(() => {
			const currentUser = this.currentProfile();
			const sentryDomain: string | null = this._appConfigService.config$_.environment.sentry.domain;
			if (sentryDomain && window.origin.includes(sentryDomain)) {
				if (currentUser) {
					Sentry.setUser({
						id: currentUser.id,
						email: currentUser.email,
					});
				} else {
					Sentry.setUser(null);
				}
			}
		});
	}

	public findUserByEmail$(email: string) {
		return this._requestService.getBasic$<{ id: string; email: string; pseudo?: string }>(`/api/users/find-by-email/${email}`);
	}

	getUsersByTokens$(tokens: string[]): Observable<{ user: User; authToken: string }[]> {
		if (DEBUG) console.log('%c[UsersRepository](getUsersByTokens$) tokens', 'color: #00a7e1; font-weight: bold', tokens);
		if (tokens.length === 0) return of([] as { user: User; authToken: string }[]);
		return this._requestService.post$<{ users: { user: User; authToken: string }[] }, string[]>('/api/users/by-tokens', tokens).pipe(
			map((response) => {
				if (DEBUG) console.log('%c[UsersRepository](getUsersByTokens$) response', 'color: #00a7e1; font-weight: bold', response);
				return response.result?.users ?? [];
			})
		);
	}

	refreshUsers() {
		this._authTokensRepository.authTokenProps$$$
			.pipe(
				switchMap((authTokenProps) => this.getUsersByTokens$(authTokenProps.availableAuthTokens.map((authToken) => authToken.token))),
				tap((connectedUsers) => this.connectedUsers$$$.next(connectedUsers)),
				take(1)
			)
			.subscribe();
	}

	getUserPublicDetails$(userId: string) {
		if (DEBUG) console.log(`Fetching public details for user ${userId}`);
		return this._requestService
			.getBasic$<{
				publicName?: string;
				profilePictureId: string;
				starredEmail?: string;
			}>(`/api/users/profile/${userId}/public-details`)
			.pipe(
				map((response) => {
					if (DEBUG) console.log(`Response for user ${userId}:`, response);
					return response.result ?? null;
				})
			);
	}

	// debounce the function to avoid too many requests
	private _usersDetailsToFetch$$$ = new BehaviorSubjectReplayed<string[]>([]);
	public fetchUsersDetails(userIds: string[]) {
		this._usersDetailsToFetch$$$.next(userIds);
	}
	private _fetchUsersDetails(userIds: string[]) {
		const currentUser = this.currentProfile();
		for (const userId of userIds) {
			// if (this.userIdsToDetails()[userId] || userId === currentUser?.id) {
			// 	continue;
			// }
			this.getUserPublicDetails$(userId)
				.pipe(
					tap((details) => {
						this.userIdsToDetails.set({
							...this.userIdsToDetails(),
							[userId]: {
								avatarUrl: details?.profilePictureId ? convertToUrl(details?.profilePictureId, 'thumbnail') : null,
								publicName: details?.publicName ?? details?.starredEmail ?? null,
							},
						});
					})
				)
				.subscribe();
		}
	}

	public setUserDetails(userId: string, details: { avatarUrl: string | null; publicName: string | null }) {
		this.userIdsToDetails.update((current) => ({
			...current,
			[userId]: details,
		}));
	}
}
