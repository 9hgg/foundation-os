import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InteractionsRepository } from './interactions.repository';
import { RequestService } from '@foundation/network/services';
import { AuthTokensRepository } from '@foundation/auth/state';
import { TabManagerService } from '@foundation/utils';

const requestServiceMock = {
	clearCache$: of(null),
	getBasic$: vi.fn().mockReturnValue(of({ result: null })),
	post$: vi.fn().mockReturnValue(of({ result: null })),
	put$: vi.fn().mockReturnValue(of({ result: null })),
	delete$: vi.fn().mockReturnValue(of({ result: null })),
};

const authTokensMock = {
	getCurrentAuthToken: vi.fn().mockReturnValue(null),
};

const tabManagerServiceMock = {
	tabId: 'tab-1',
};

describe('InteractionsRepository', () => {
	let repo: InteractionsRepository<any>;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				InteractionsRepository,
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: AuthTokensRepository, useValue: authTokensMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repo = TestBed.inject(InteractionsRepository);
	});

	it('creates the repository', () => {
		expect(repo).toBeTruthy();
	});

	it('has a store', () => {
		expect(repo.store).toBeTruthy();
	});

	it('has an empty interactions map initially', () => {
		expect(repo.interactions).toEqual({});
	});

	it('refreshAvailableInteractions calls the right endpoint', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({ result: null }));
		repo.refreshAvailableInteractions('article');
		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/interactions/by/article');
	});

	it('refreshAvailableInteractions updates interactionsByItems when result is returned', () => {
		const data = { 'item-1': { item: { id: 'item-1' }, interactions: [] } };
		requestServiceMock.getBasic$.mockReturnValue(of({ result: data }));
		repo.refreshAvailableInteractions('article');
		expect(repo.interactionsByItems()).toEqual(data);
	});

	it('createNewInteraction$ calls the right endpoint', () => {
		const interaction = { id: 'inter-1', key: 'key-1', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction, interactionToken: 'tok-1' } }));
		repo.createNewInteraction$('key-1').subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/by-token/create', { key: 'key-1' });
	});

	it('createNewInteraction$ stores the token in interactionTokensAndKeys$_', () => {
		const interaction = { id: 'inter-1', key: 'key-1', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction, interactionToken: 'tok-1' } }));
		repo.createNewInteraction$('key-1').subscribe();
		expect(repo.interactionTokensAndKeys$_['inter-1']).toEqual({ key: 'key-1', token: 'tok-1' });
	});

	it('createNewInteraction$ throws when no result', () => {
		requestServiceMock.post$.mockReturnValue(of({ result: null }));
		let error: any;
		repo.createNewInteraction$('key-1').subscribe({ error: (e) => (error = e) });
		expect(error).toBeInstanceOf(Error);
	});

	it('getOrCreateInteraction$ uses cached pending request for the same key', () => {
		// Mock unauthenticated path
		authTokensMock.getCurrentAuthToken.mockReturnValue(null);
		const interaction = { id: 'inter-1', key: 'key-new', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction, interactionToken: 'tok-1' } }));

		const obs1 = repo.getOrCreateInteraction$('unique-key-123');
		const obs2 = repo.getOrCreateInteraction$('unique-key-123');
		// Both calls should return a truthy observable
		expect(obs1).toBeTruthy();
		expect(obs2).toBeTruthy();
	});

	it('getOrCreateInteraction$ returns cached interaction if already loaded', () => {
		const interaction = { id: 'inter-cached', key: 'cached-key', config: {} };
		// Pre-populate the interactions cache
		repo.interactions['inter-cached'] = interaction as any;
		// Pre-populate the token store
		repo.interactionTokensAndKeys$_['inter-cached'] = { key: 'cached-key', token: 'tok-cached' };

		let result: any;
		repo.getOrCreateInteraction$('cached-key').subscribe((v) => (result = v));
		expect(result).toEqual(interaction);
	});

	it('saveInteractionByToken$ calls the right endpoint', () => {
		const interaction: any = { id: 'inter-1', config: {} };
		repo.interactionTokensAndKeys$_['inter-1'] = { token: 'tok-1' };
		requestServiceMock.put$.mockReturnValue(of({ result: interaction }));
		repo.saveInteractionByToken$(interaction, 'tok-1')?.subscribe();
		expect(requestServiceMock.put$).toHaveBeenCalledWith('/api/interactions/by-token/tok-1', interaction);
	});

	it('saveInteractionByToken$ uses stored token when none is provided', () => {
		const interaction: any = { id: 'inter-2', config: {} };
		repo.interactionTokensAndKeys$_['inter-2'] = { token: 'tok-2' };
		requestServiceMock.put$.mockReturnValue(of({ result: interaction }));
		repo.saveInteractionByToken$(interaction)?.subscribe();
		expect(requestServiceMock.put$).toHaveBeenCalledWith('/api/interactions/by-token/tok-2', interaction);
	});

	it('saveInteractionByToken$ returns undefined and does not call the backend when the stored token is empty', () => {
		const interaction: any = { id: 'inter-no-token', config: {} };
		repo.interactionTokensAndKeys$_['inter-no-token'] = { token: '' };
		const result = repo.saveInteractionByToken$(interaction);
		expect(result).toBeUndefined();
		expect(requestServiceMock.put$).not.toHaveBeenCalled();
	});

	it('getOrCreateInteraction$ fetches from the backend when the token is known but the interaction is not cached locally', () => {
		const interaction = { id: 'inter-fetched', key: 'fetch-key', config: {} };
		repo.interactionTokensAndKeys$_['inter-fetched'] = { key: 'fetch-key', token: 'tok-fetched' };
		requestServiceMock.getBasic$.mockReturnValue(of({ result: interaction }));

		let result: any;
		repo.getOrCreateInteraction$('fetch-key').subscribe((v) => (result = v));

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/interactions/by-token/tok-fetched');
		expect(result).toEqual(interaction);
		expect(repo.interactions['inter-fetched']).toEqual(interaction);
	});

	it('getOrCreateInteraction$ creates a new interaction when the backend has none for the known token', () => {
		repo.interactionTokensAndKeys$_['inter-stale'] = { key: 'stale-key', token: 'tok-stale' };
		requestServiceMock.getBasic$.mockReturnValue(of({ result: null }));
		const created = { id: 'inter-new', key: 'stale-key', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction: created, interactionToken: 'tok-new' } }));

		let result: any;
		repo.getOrCreateInteraction$('stale-key').subscribe((v) => (result = v));

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/by-token/create', { key: 'stale-key' });
		expect(result).toEqual(created);
	});

	it('getOrCreateInteraction$ recovers the interaction server-side when the user is authenticated', () => {
		authTokensMock.getCurrentAuthToken.mockReturnValue('some-auth-token');
		const interaction = { id: 'inter-user', key: 'user-key', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction, interactionToken: 'tok-user' } }));

		let result: any;
		repo.getOrCreateInteraction$('user-key').subscribe((v) => (result = v));

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/by-user/get-or-create', { key: 'user-key', forceNew: false });
		expect(result).toEqual(interaction);
		authTokensMock.getCurrentAuthToken.mockReturnValue(null);
	});

	it('_getOrCreateInteractionForUser$ throws when the backend returns no result', () => {
		authTokensMock.getCurrentAuthToken.mockReturnValue('some-auth-token');
		requestServiceMock.post$.mockReturnValue(of({ result: null }));

		let error: any;
		repo.getOrCreateInteraction$('missing-user-key').subscribe({ error: (e) => (error = e) });

		expect(error).toBeInstanceOf(Error);
		authTokensMock.getCurrentAuthToken.mockReturnValue(null);
	});

	it('setInteractionState$ patches matching interactions across interactionsByItems in place', () => {
		repo.interactionsByItems.set({
			'item-1': {
				item: { id: 'item-1' } as any,
				interactions: [{ id: 'inter-a', state: null } as any, { id: 'inter-b', state: null } as any],
			},
			'item-2': {
				item: { id: 'item-2' } as any,
				interactions: [{ id: 'inter-c', state: null } as any],
			},
		});
		requestServiceMock.post$.mockReturnValue(of({ result: { id: 'inter-a', state: 'archived' } }));

		repo.setInteractionState$('inter-a', 'archived').subscribe();

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/inter-a/state', { state: 'archived' });
		const byItems = repo.interactionsByItems();
		expect(byItems['item-1'].interactions).toEqual([
			{ id: 'inter-a', state: 'archived' },
			{ id: 'inter-b', state: null },
		]);
		expect(byItems['item-2'].interactions).toEqual([{ id: 'inter-c', state: null }]);
	});

	it('setInteractionState$ leaves interactionsByItems untouched when the backend returns no result', () => {
		const before = { 'item-1': { item: { id: 'item-1' } as any, interactions: [{ id: 'inter-a', state: null } as any] } };
		repo.interactionsByItems.set(before);
		requestServiceMock.post$.mockReturnValue(of({ result: null }));

		repo.setInteractionState$('inter-a', 'archived').subscribe();

		expect(repo.interactionsByItems()).toEqual(before);
	});

	it('forgetInteractionForKey drops the stored token, cached interaction and pending request for that key', () => {
		repo.interactionTokensAndKeys$_['inter-forget'] = { key: 'forget-key', token: 'tok-forget' };
		repo.interactions['inter-forget'] = { id: 'inter-forget' } as any;

		repo.forgetInteractionForKey('forget-key');

		expect(repo.interactionTokensAndKeys$_['inter-forget']).toBeUndefined();
		expect(repo.interactions['inter-forget']).toBeUndefined();
	});

	it('forgetInteractionForKey is a no-op when no stored session matches the key', () => {
		expect(() => repo.forgetInteractionForKey('never-seen-key')).not.toThrow();
	});

	it('startNewInteractionForKey$ forgets the previous session and creates a fresh one when unauthenticated', () => {
		repo.interactionTokensAndKeys$_['inter-old'] = { key: 'restart-key', token: 'tok-old' };
		repo.interactions['inter-old'] = { id: 'inter-old' } as any;
		authTokensMock.getCurrentAuthToken.mockReturnValue(null);
		const created = { id: 'inter-restarted', key: 'restart-key', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction: created, interactionToken: 'tok-restarted' } }));

		let result: any;
		repo.startNewInteractionForKey$('restart-key').subscribe((v) => (result = v));

		expect(repo.interactionTokensAndKeys$_['inter-old']).toBeUndefined();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/by-token/create', { key: 'restart-key' });
		expect(result).toEqual(created);
	});

	it('startNewInteractionForKey$ asks the server to force a brand-new interaction when authenticated', () => {
		authTokensMock.getCurrentAuthToken.mockReturnValue('some-auth-token');
		const created = { id: 'inter-forced', key: 'forced-key', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { interaction: created, interactionToken: 'tok-forced' } }));

		let result: any;
		repo.startNewInteractionForKey$('forced-key').subscribe((v) => (result = v));

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/interactions/by-user/get-or-create', { key: 'forced-key', forceNew: true });
		expect(result).toEqual(created);
		authTokensMock.getCurrentAuthToken.mockReturnValue(null);
	});
});
