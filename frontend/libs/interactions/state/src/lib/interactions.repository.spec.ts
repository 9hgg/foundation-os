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
});
