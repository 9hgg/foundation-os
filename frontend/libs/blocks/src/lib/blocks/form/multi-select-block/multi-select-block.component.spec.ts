import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { MultiSelectBlockComponent } from './multi-select-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('MultiSelectBlockComponent', () => {
	let component: MultiSelectBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [MultiSelectBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(MultiSelectBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default options', () => {
		expect(component.options().length).toBe(3);
		expect(component.maxSelection()).toBe(1);
		expect(component.minSelection()).toBe(0);
	});

	it('isRadioMode is true when maxSelection is 1', () => {
		expect(component.isRadioMode()).toBe(true);
	});

	it('isRadioMode is false when maxSelection > 1', () => {
		component.maxSelection.set(3);
		expect(component.isRadioMode()).toBe(false);
	});

	describe('onSelectionChange', () => {
		it('sets single value in radio mode', () => {
			component.onSelectionChange('option1', true);
			expect(component.selectedValues()).toEqual(['option1']);
		});

		it('replaces value in radio mode', () => {
			component.onSelectionChange('option1', true);
			component.onSelectionChange('option2', true);
			expect(component.selectedValues()).toEqual(['option2']);
		});

		it('adds values in checkbox mode', () => {
			component.maxSelection.set(3);
			component.onSelectionChange('option1', true);
			component.onSelectionChange('option2', true);
			expect(component.selectedValues()).toEqual(['option1', 'option2']);
		});

		it('removes unchecked value in checkbox mode', () => {
			component.maxSelection.set(3);
			component.onSelectionChange('option1', true);
			component.onSelectionChange('option2', true);
			component.onSelectionChange('option1', false);
			expect(component.selectedValues()).toEqual(['option2']);
		});

		it('does not exceed maxSelection in checkbox mode', () => {
			component.maxSelection.set(2);
			component.onSelectionChange('option1', true);
			component.onSelectionChange('option2', true);
			component.onSelectionChange('option3', true);
			expect(component.selectedValues().length).toBe(2);
		});
	});

	describe('isValid', () => {
		it('is valid with 0 selections when not required', () => {
			expect(component.isValid()).toBe(true);
		});

		it('is invalid with 0 selections when required', () => {
			component.required.set(true);
			expect(component.isValid()).toBe(false);
		});
	});

	describe('option management', () => {
		it('addOption adds a new option', () => {
			const initialCount = component.options().length;
			component.addOption();
			expect(component.options().length).toBe(initialCount + 1);
		});

		it('removeOption removes an option (keeps at least 1)', () => {
			component.removeOption(0);
			expect(component.options().length).toBe(2);
		});

		it('removeOption does not remove last option', () => {
			component.removeOption(0);
			component.removeOption(0);
			component.removeOption(0);
			expect(component.options().length).toBe(1);
		});

		it('removeOption cleans up selectedValues', () => {
			component.onSelectionChange('option1', true);
			component.removeOption(0);
			expect(component.selectedValues()).toEqual([]);
		});

		it('moveOptionUp swaps with previous', () => {
			const origFirst = component.options()[0].value;
			const origSecond = component.options()[1].value;
			component.moveOptionUp(1);
			expect(component.options()[0].value).toBe(origSecond);
			expect(component.options()[1].value).toBe(origFirst);
		});

		it('moveOptionUp does nothing at index 0', () => {
			const origFirst = component.options()[0].value;
			component.moveOptionUp(0);
			expect(component.options()[0].value).toBe(origFirst);
		});

		it('moveOptionDown swaps with next', () => {
			const origFirst = component.options()[0].value;
			const origSecond = component.options()[1].value;
			component.moveOptionDown(0);
			expect(component.options()[0].value).toBe(origSecond);
			expect(component.options()[1].value).toBe(origFirst);
		});
	});

	it('isSelected returns correct status', () => {
		component.onSelectionChange('option1', true);
		expect(component.isSelected('option1')).toBe(true);
		expect(component.isSelected('option2')).toBe(false);
	});

	it('canSelectMore returns true when under max', () => {
		component.maxSelection.set(3);
		expect(component.canSelectMore()).toBe(true);
	});

	describe('export options', () => {
		it('returns 3 export options', () => {
			const opts = MultiSelectBlockComponent.getExportOptions();
			expect(opts.length).toBe(3);
			expect(opts.map((o) => o.id)).toEqual(['multi-select-as-json', 'multi-select-as-string', 'multi-select-labels-as-json']);
		});

		it('as-string returns comma-separated values', () => {
			const opt = MultiSelectBlockComponent.getExportOptions()[1];
			const interaction = { config: { 'o1.s1.b1.selectedValues': ['a', 'b'] } };
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1')).toBe('a, b');
		});
	});
});
