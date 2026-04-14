import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { TextSimpleRequestBlockComponent } from './text-simple-request-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('TextSimpleRequestBlockComponent', () => {
	let component: TextSimpleRequestBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [TextSimpleRequestBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(TextSimpleRequestBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('text starts as null', () => {
		expect(component.text()).toBeNull();
	});

	it('textLength is 0 when text is null', () => {
		expect(component.textLength()).toBe(0);
	});

	it('textLength reflects text length', () => {
		component.text.set('hello');
		expect(component.textLength()).toBe(5);
	});

	describe('getExportOptions', () => {
		it('returns 1 option', () => {
			const opts = TextSimpleRequestBlockComponent.getExportOptions();
			expect(opts.length).toBe(1);
			expect(opts[0].id).toBe('text-request-as-plain-text');
		});

		it('returns empty for null interaction', () => {
			const opt = TextSimpleRequestBlockComponent.getExportOptions()[0];
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1')).toBe('');
		});
	});
});
