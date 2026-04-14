import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { CheckboxBlockComponent } from './checkbox-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('CheckboxBlockComponent', () => {
	let component: CheckboxBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [CheckboxBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(CheckboxBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.checked()).toBe(false);
		expect(component.label()).toBe('Checkbox option');
		expect(component.required()).toBe(false);
	});

	it('onLabelChange updates label', () => {
		const event = { target: { textContent: 'New label' } } as any;
		component.onLabelChange(event);
		expect(component.label()).toBe('New label');
	});

	it('onLabelChange falls back on empty textContent', () => {
		const event = { target: { textContent: '' } } as any;
		component.onLabelChange(event);
		expect(component.label()).toBe('Checkbox option');
	});

	describe('export options', () => {
		it('returns 2 export options', () => {
			const opts = CheckboxBlockComponent.getExportOptions();
			expect(opts.length).toBe(2);
			expect(opts.map((o) => o.id)).toEqual(['checkbox-as-boolean', 'checkbox-as-text']);
		});

		it('checkbox-as-boolean returns false for null interaction', () => {
			const opt = CheckboxBlockComponent.getExportOptions()[0];
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1')).toBe(false);
		});

		it('checkbox-as-text returns "Yes" for checked', () => {
			const opt = CheckboxBlockComponent.getExportOptions()[1];
			const interaction = { config: { 'o1.s1.b1.checked': true } };
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1')).toBe('Yes');
		});

		it('checkbox-as-text returns "No" for unchecked', () => {
			const opt = CheckboxBlockComponent.getExportOptions()[1];
			const interaction = { config: { 'o1.s1.b1.checked': false } };
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1')).toBe('No');
		});
	});
});
