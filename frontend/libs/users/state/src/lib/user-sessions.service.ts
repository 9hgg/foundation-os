import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationService } from '@foundation/notification';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { AuthTokenDetails, AuthTokenProps, AuthTokensRepository } from '@foundation/auth/state';
import { UsersRepository } from './users.repository';
import { User } from '@foundation/users/models';
import { EMPTY, Subscription, combineLatest, map, switchMap, tap, timer } from 'rxjs';

type ConnectedUserEntry = { user: User; authToken: string };
const SESSION_DEBUG = false;

@Injectable({ providedIn: 'root' })
export class UserSessionsService {
	private readonly _authTokensRepository = inject(AuthTokensRepository);
	private readonly _usersRepository = inject(UsersRepository);
	private readonly _router = inject(Router);
	private readonly _notifications = inject(NotificationService);
	private readonly _translations = inject(TranslationService);
	private readonly _sessionSwitchedTitle = this._translations.prep('Session switched');
	private readonly _sessionDisconnectSoonTitle = this._translations.prep('Session ending soon');
	private _disconnectWarningSub: Subscription | null = null;

	constructor() {
		combineLatest([this._authTokensRepository.authTokenProps$$$.pipe(map((props) => props as AuthTokenProps)), this._usersRepository.connectedUsers$$$.$])
			.pipe(
				takeUntilDestroyed(),
				switchMap(([props, connectedUsers]) => {
					if (!props.availableAuthTokens.length) {
						if (props.currentAuthToken) {
							this._log('No auth tokens available – logging out');
							this._handleNoTokens();
						}
						this._cancelDisconnectWarning();
						return EMPTY;
					}

					const soonestExpiration = Math.min(...props.availableAuthTokens.map((token) => token.decodedToken.exp * 1000));
					const waitMs = Math.max(0, soonestExpiration - Date.now());
					this._log('Scheduling token purge task', { waitMs });
					this._scheduleDisconnectWarning(props, connectedUsers, waitMs);
					return timer(waitMs).pipe(tap(() => this._purgeExpiredTokens(connectedUsers)));
				})
			)
			.subscribe();
	}

	private _log(message: string, payload?: unknown) {
		if (!SESSION_DEBUG) return;
		const style = 'color: #00a7e1; font-weight: bold';
		if (payload !== undefined) {
			console.log('%c[UserSessionsService]', style, message, payload);
		} else {
			console.log('%c[UserSessionsService]', style, message);
		}
	}

	private _scheduleDisconnectWarning(props: AuthTokenProps, connectedUsers: ConnectedUserEntry[], waitMs: number) {
		this._cancelDisconnectWarning();
		const tokens = props.availableAuthTokens;
		if (!tokens.length) return;

		const soonestExpiration = Math.min(...tokens.map((token) => token.decodedToken.exp * 1000));
		const tokensExpiringSoon = tokens.filter((token) => token.decodedToken.exp * 1000 === soonestExpiration);
		const willDisconnect = tokens.length === tokensExpiringSoon.length;

		if (!willDisconnect) {
			return;
		}

		const warningLeadTimeMs = 10000;
		const warningDelay = Math.max(0, waitMs - warningLeadTimeMs);
		this._disconnectWarningSub = timer(warningDelay).subscribe(() => {
			const ownerLabel = this._formatTokenOwner(tokensExpiringSoon[0], connectedUsers);
			this._notifications.snackWarning(`${ownerLabel} will be disconnected in 10 seconds because their session is about to expire.`, this._sessionDisconnectSoonTitle(), {
				dialogTarget: 'auth-session-disconnect-warning',
			});
		});
	}

	private _cancelDisconnectWarning() {
		if (this._disconnectWarningSub) {
			this._disconnectWarningSub.unsubscribe();
			this._disconnectWarningSub = null;
		}
	}

	private _handleNoTokens() {
		this._cancelDisconnectWarning();
		this._authTokensRepository.logout();
		this._router.navigate(['/auth/login']);
	}

	private _purgeExpiredTokens(connectedUsers: ConnectedUserEntry[]) {
		const props = this._authTokensRepository.authTokenProps$$$.value;
		const now = Date.now();
		const expiredTokens = props.availableAuthTokens.filter((token) => token.decodedToken.exp * 1000 <= now);
		if (!expiredTokens.length) {
			this._log('Expiry timer fired but no tokens were expired');
			return;
		}

		this._log('Scheduled purge removing tokens', {
			owners: expiredTokens.map((token) => this._formatTokenOwner(token, connectedUsers)),
		});

		const remainingTokens = props.availableAuthTokens.filter((token) => token.decodedToken.exp * 1000 > now);
		const currentExpired = props.currentAuthToken && expiredTokens.some((token) => token.token === props.currentAuthToken?.token);

		if (!remainingTokens.length) {
			this._handleNoTokens();
			return;
		}

		const previousCurrent = props.currentAuthToken;
		const nextCurrentAuthToken = currentExpired ? remainingTokens[0] : props.currentAuthToken;

		this._authTokensRepository.setAuthTokenProps({
			availableAuthTokens: remainingTokens,
			currentAuthToken: nextCurrentAuthToken,
		});

		if (currentExpired && nextCurrentAuthToken && previousCurrent) {
			const previousUser = this._formatTokenOwner(previousCurrent, connectedUsers);
			const nextUser = this._formatTokenOwner(nextCurrentAuthToken, connectedUsers);
			this._notifications.snackWarning(`${previousUser} was signed out because their session expired. Continuing with ${nextUser}.`, this._sessionSwitchedTitle(), { dialogTarget: 'auth-session-switch' });
		}
	}

	private _formatTokenOwner(token: AuthTokenDetails | null | undefined, connectedUsers: ConnectedUserEntry[]) {
		if (!token) return 'this account';
		const matchingUser = connectedUsers.find((entry) => entry.user.id === token.userId)?.user;
		if (matchingUser) {
			return matchingUser.email ?? matchingUser.id;
		}
		return token.userId ?? `${token.token.slice(0, 6)}…`;
	}
}
