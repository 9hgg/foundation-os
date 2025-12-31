import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { RequestService } from '@foundation/network/services';
import { DomSanitizer } from '@angular/platform-browser';
import { of } from 'rxjs';

describe('TranslationService', () => {
	let service: TranslationService;

	beforeEach(() => {
		const requestServiceMock = {
			post$: vi.fn().mockReturnValue(of({ result: [] })),
		};

		const domSanitizerMock = {
			sanitize: vi.fn(),
			bypassSecurityTrustHtml: vi.fn(),
		};

		TestBed.configureTestingModule({
			providers: [TranslationService, { provide: RequestService, useValue: requestServiceMock }, { provide: DomSanitizer, useValue: domSanitizerMock }],
		});
		service = TestBed.inject(TranslationService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('fillPlaceholders', () => {
		it('should replace placeholders', () => {
			const result = service.fillPlaceholders('Hello §name', { name: 'World' });
			expect(result).toBe('Hello World');
		});

		it('should replace multiple placeholders', () => {
			const result = service.fillPlaceholders('Hello §name, welcome to §place', { name: 'User', place: 'Spoken' });
			expect(result).toBe('Hello User, welcome to Spoken');
		});

		it('should handle missing placeholders in kv', () => {
			const result = service.fillPlaceholders('Hello §name', {});
			expect(result).toBe('Hello §name');
		});
	});

	describe('translate$', () => {
		it('should return input sentence if no translation available', async () => {
			const res = await new Promise<string>((resolve) => {
				service.translate$({ inputSentence: 'Hello' }).subscribe(resolve);
			});
			expect(res).toBe('Hello');
		});
	});
});
