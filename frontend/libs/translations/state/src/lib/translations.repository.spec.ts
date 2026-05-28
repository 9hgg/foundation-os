import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { NEVER, of } from 'rxjs';
import { TranslationsRepository } from './translations.repository';

const routerMock = { navigate: vi.fn() };
const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
	post$: vi.fn().mockReturnValue(of({})),
	put$: vi.fn(),
	delete$: vi.fn(),
};
const notificationMock = { snack: vi.fn() };
const translationMock = { prep: vi.fn((v: string) => () => v) };
const tabManagerMock = { tabId: 'tab-1' };

describe('TranslationsRepository', () => {
	let repo: TranslationsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				TranslationsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerMock },
			],
		});
		repo = TestBed.inject(TranslationsRepository);
	});

	it('creates a repository instance', () => {
		expect(repo).toBeTruthy();
	});

	it('uses /api/translations as the api_url', () => {
		expect(repo.api_url).toBe('/api/translations');
	});

	it('has kind set to translation', () => {
		expect(repo.kind).toBe('translation');
	});

	it('postManualTranslation$ calls the manual endpoint', () => {
		const translation = { id: '1', hash: 'h', sourceContent: 's', languageSource: 'en', languageTarget: 'fr', translatedContent: 'bonjour', translator: null, version: null, translationContext: null };
		repo.postManualTranslation$(translation).subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/translations/manual', translation);
	});

	it('delete$ calls the manual delete endpoint', () => {
		repo.delete$('trans-1').subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/translations/manual/trans-1/delete', {});
	});
});
