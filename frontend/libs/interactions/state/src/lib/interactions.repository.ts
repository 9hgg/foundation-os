import { AuthTokensRepository } from '@foundation/auth/state';
import { Interaction } from '@foundation/interactions/models';
import { SmartRestStore } from '@foundation/network/store';
import { RequestService } from '@foundation/network/services';
import { behaviorSubjectProxyStored, BehaviorSubjectReplayedFromObs } from '@foundation/utils';
import { inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { finalize, map, Observable, of, shareReplay, switchMap, tap } from 'rxjs';

const DEBUG = false;

@Injectable({ providedIn: 'root' })
export class InteractionsRepository<T> {
	store: SmartRestStore<Interaction> = new SmartRestStore<Interaction>('/api/interactions', 'interaction');
	_requestService = inject(RequestService);
	private _authTokensRepository = inject(AuthTokensRepository);

	/** Map an interaction id to a token to be able to claim it to the backend */
	interactionTokensAndKeys$_ = behaviorSubjectProxyStored<{ [interactionId: string]: { key?: string; token: string } }>('interactionTokens', {});

	/** Map an interaction id to an interaction itself and its a token
	 *
	 * It will be "filled" at construction time by getting the interaction by token
	 */
	interactions: {
		[interactionId: string]: Interaction;
	} = {};

	/** Cache for pending getOrCreateInteraction$ requests to prevent duplicate creation */
	private pendingInteractionRequests = new Map<string, Observable<Interaction>>();

	interactionsByItems = signal<{
		[itemId: string]: {
			item: T;
			interactions: Interaction[];
		};
	}>({});

	interactionsByItems$$$ = BehaviorSubjectReplayedFromObs({}, toObservable(this.interactionsByItems));

	constructor() {
		// this is useless as it is because interactions are created without ACLs.
		this.store.objects$$$
			.pipe(
				tap((interactions) => {
					if (DEBUG) console.log('[InteractionsRepository] store.objects$$$', interactions);
				})
			)
			.subscribe();

		// Only locally available tokens allow to get interactions
		this.interactionTokensAndKeys$_.$.pipe(
			tap((interactions) => {
				if (DEBUG) console.log('[interactionTokensAndKeys$_] interactionTokens:', interactions);
			})
		).subscribe();
	}

	public refreshAvailableInteractions(resourceKind: string) {
		// we need to go trough the items to see the interactions behind them.
		this._requestService
			.getBasic$<{
				[itemId: string]: {
					item: T;
					interactions: Interaction[];
				};
			}>('/api/interactions/by/' + resourceKind)
			.pipe(
				map((response) => response.result ?? null),
				tap((interactions) => {
					if (DEBUG) console.log('[InteractionsRepository] interactions by ' + resourceKind, interactions);
					if (interactions) this.interactionsByItems.set(interactions);
				})
			)
			.subscribe();
	}

	/**
	 * Create a new interaction.
	 * Get also a token for the interaction.
	 * By adding the token to the interactionTokens$_ we store the token locally.
	 * @param context
	 * @returns
	 */
	createNewInteraction$(key?: string): Observable<Interaction> {
		return this._requestService.post$<{ interaction: Interaction; interactionToken: string }, { key: string | undefined }>('/api/interactions/by-token/create', { key }).pipe(
			map((response) => {
				if (response.result) {
					if (DEBUG)
						console.log('[InteractionsRepository](createNewInteraction$) new interaction created', {
							interactionAndToken: response.result,
							key,
						});

					const { interaction, interactionToken } = response.result;
					this.interactionTokensAndKeys$_[interaction.id] = { key: interaction.key, token: interactionToken };
					return response.result.interaction;
				} else {
					throw new Error('No interaction returned');
				}
			})
		);
	}

	getOrCreateInteraction$(key: string): Observable<Interaction> {
		if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) getting or creating interaction for key', key);

		// Check if there's already a pending request for this key
		const pendingRequest = this.pendingInteractionRequests.get(key);
		if (pendingRequest) {
			if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) returning existing pending request for key', key);
			return pendingRequest;
		}

		// is it in interactionTokens$_? (find it comparing the key)
		// Several sessions can be stored for the same key (the respondent started the form again),
		// so take the most recently registered one: object keys keep insertion order, and a new
		// session is always appended.
		const interactionTokenAndKey = Object.entries(this.interactionTokensAndKeys$_._)
			.filter(([, interactionKeyAndToken]) => interactionKeyAndToken.key === key)
			.pop();

		// we have an interaction token for this key
		if (interactionTokenAndKey) {
			const [interactionId, KeyAndToken] = interactionTokenAndKey;
			const { token } = KeyAndToken;

			if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) interaction token found for key', key, ': getting interaction');

			// is it in interactions$_?
			if (this.interactions[interactionId]) {
				if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) interaction found already available locally in interactions$_', this.interactions[interactionId]);
				return of(this.interactions[interactionId]);
			} else {
				if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) interaction not found locally in interactions$_: getting it from the backend');

				const requested$ = this._getInteractionByToken$(token).pipe(
					switchMap((interaction) => {
						if (interaction) {
							if (DEBUG) console.log('[InteractionsRepository](_getOrCreateInteraction$) interaction found in the backend', interaction);

							this.interactions[interactionId] = interaction;
							return of(interaction);
						}
						if (DEBUG) console.warn('[InteractionsRepository](_getOrCreateInteraction$) interaction not found in the backend');

						return this.createNewInteraction$(key);
					}),
					finalize(() => {
						// Remove from pending requests when completed
						this.pendingInteractionRequests.delete(key);
					}),
					shareReplay(1)
				);

				// Cache the request
				this.pendingInteractionRequests.set(key, requested$);

				return requested$;
			}
		}

		if (DEBUG) console.log('[InteractionsRepository](getOrCreateInteraction$) no interaction token found for key', key, ': creating a new interaction');

		// If the user is authenticated, recover or create their interaction server-side
		// so it survives logout/login cycles (localStorage is wiped on logout).
		const isAuthenticated = !!this._authTokensRepository.getCurrentAuthToken();
		const source$ = isAuthenticated ? this._getOrCreateInteractionForUser$(key) : this.createNewInteraction$(key);

		const createRequest$ = source$.pipe(
			finalize(() => {
				this.pendingInteractionRequests.delete(key);
			}),
			shareReplay(1)
		);

		this.pendingInteractionRequests.set(key, createRequest$);
		return createRequest$;
	}

	/**
	 * Get interaction by token.
	 * Used from locally stored interaction tokens to get the interaction at construction time.
	 * @param token
	 * @returns
	 */
	private _getInteractionByToken$(token: string): Observable<Interaction | null> {
		return this._requestService.getBasic$<Interaction>('/api/interactions/by-token/' + token).pipe(map((response) => response.result ?? null));
	}

	private _getOrCreateInteractionForUser$(key: string, forceNew = false): Observable<Interaction> {
		return this._requestService.post$<{ interaction: Interaction; interactionToken: string }, { key: string; forceNew: boolean }>(
			'/api/interactions/by-user/get-or-create',
			{ key, forceNew }
		).pipe(
			map((response) => {
				if (response.result) {
					const { interaction, interactionToken } = response.result;
					this.interactionTokensAndKeys$_[interaction.id] = { key: interaction.key, token: interactionToken };
					return interaction;
				}
				throw new Error('Failed to get or create interaction for user');
			})
		);
	}

	/** Set a host-side lifecycle marker on an interaction (e.g. 'archived', or null to restore).
	 * Authorized server-side by WRITE on the parent resource. Patches interactionsByItems in
	 * place on success so the list re-renders without a refetch. */
	public setInteractionState$(interactionId: string, state: string | null) {
		return this._requestService.post$<Interaction, { state: string | null }>(`/api/interactions/${interactionId}/state`, { state }).pipe(
			tap((response) => {
				if (!response.result) return;
				this.interactionsByItems.update((byItems) => {
					const next = { ...byItems };
					for (const itemId of Object.keys(next)) {
						const entry = next[itemId];
						if (!entry.interactions.some((interaction) => interaction.id === interactionId)) continue;
						next[itemId] = {
							...entry,
							interactions: entry.interactions.map((interaction) => (interaction.id === interactionId ? { ...interaction, state } : interaction)),
						};
					}
					return next;
				});
			})
		);
	}

	/**
	 * Forget the locally stored session for a key, so the next getOrCreateInteraction$ creates a
	 * brand-new interaction instead of reopening the existing one. The interaction itself is left
	 * untouched on the server: this only drops *this device's* claim on it.
	 */
	public forgetInteractionForKey(key: string) {
		const stored = this.interactionTokensAndKeys$_._;
		const entry = Object.entries(stored).find(([, keyAndToken]) => keyAndToken.key === key);
		if (!entry) return;

		const [interactionId] = entry;
		delete this.interactionTokensAndKeys$_[interactionId];
		delete this.interactions[interactionId];
		this.pendingInteractionRequests.delete(key);
	}

	/**
	 * Start a brand-new session for a key, leaving the previous one untouched.
	 *
	 * Forgetting the local token is not enough for a signed-in respondent: the server resolves
	 * their interaction from user + key, so it would hand the same one straight back. Ask for a
	 * fresh one explicitly, and fall back to the token flow when nobody is signed in.
	 */
	public startNewInteractionForKey$(key: string): Observable<Interaction> {
		this.forgetInteractionForKey(key);
		const isAuthenticated = !!this._authTokensRepository.getCurrentAuthToken();
		return isAuthenticated ? this._getOrCreateInteractionForUser$(key, true) : this.createNewInteraction$(key);
	}

	public saveInteractionByToken$(interaction: Interaction, _token?: string) {
		if (DEBUG) console.log('[InteractionsRepository](saveInteractionByToken) pushing interaction to server', interaction, _token);

		const token = _token ?? this.interactionTokensAndKeys$_[interaction.id].token;
		if (!token) {
			if (DEBUG) console.error('[InteractionsRepository](saveInteractionByToken) no token found for interaction (cant push to server)', interaction);
			return;
		}

		return this._requestService.put$<Interaction>('/api/interactions/by-token/' + token, interaction).pipe(
			tap((response) => {
				if (response.result) {
					if (DEBUG) console.log('[InteractionsRepository](saveInteractionByToken) interaction saved in server', response.result);
				}
			})
		);
	}
}
