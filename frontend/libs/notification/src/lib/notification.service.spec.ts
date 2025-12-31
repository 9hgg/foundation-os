import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { Dialog } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { of } from 'rxjs';

describe('NotificationService', () => {
	let service: NotificationService;
	let dialogMock: any;
	let overlayMock: any;
	let translationServiceMock: any;

	beforeEach(() => {
		dialogMock = {
			open: vi.fn().mockReturnValue({
				closed: of(undefined),
				close: vi.fn(),
			}),
			closeAll: vi.fn(),
		};

		overlayMock = {
			position: vi.fn().mockReturnValue({
				global: vi.fn().mockReturnValue({
					top: vi.fn().mockReturnThis(),
					left: vi.fn().mockReturnThis(),
					right: vi.fn().mockReturnThis(),
					bottom: vi.fn().mockReturnThis(),
				}),
			}),
		};

		translationServiceMock = {
			prep: vi.fn().mockReturnValue(() => 'translated'),
		};

		TestBed.configureTestingModule({
			providers: [NotificationService, { provide: Dialog, useValue: dialogMock }, { provide: Overlay, useValue: overlayMock }, { provide: TranslationService, useValue: translationServiceMock }],
		});
		service = TestBed.inject(NotificationService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should open notification dialog', () => {
		service.notify('Message', 'Title');
		expect(dialogMock.open).toHaveBeenCalled();
	});

	it('should open confirm dialog', () => {
		service.confirm('Message', 'Title');
		expect(dialogMock.open).toHaveBeenCalled();
	});

	it('should open prompt dialog', () => {
		service.prompt('Message', 'Title');
		expect(dialogMock.open).toHaveBeenCalled();
	});
});
