import { TestBed } from '@angular/core/testing';
import { InteractionTableComponent } from './interaction-table.component';

describe('InteractionTableComponent', () => {
	const buildFixture = () => {
		TestBed.overrideComponent(InteractionTableComponent, { set: { template: '', imports: [], styles: [] } });
		const fixture = TestBed.createComponent(InteractionTableComponent);
		fixture.detectChanges();
		return fixture;
	};

	afterEach(() => TestBed.resetTestingModule());

	it('shows whatever interactions it is handed, and none by default', () => {
		const fixture = buildFixture();

		expect(fixture.componentInstance.explicitInteractions()).toBeNull();

		fixture.componentRef.setInput('explicitInteractions', [{ id: 'interaction-1' }]);
		expect(fixture.componentInstance.explicitInteractions()).toEqual([{ id: 'interaction-1' }]);
	});

	it('starts with nothing selected', () => {
		const fixture = buildFixture();

		expect(fixture.componentInstance.selectedInteractions.selectedItems).toEqual([]);
	});

	it('identifies interactions by id, so the same interaction is never selected twice', () => {
		const fixture = buildFixture();
		const selector = fixture.componentInstance.selectedInteractions;

		selector.selectMultiple([{ id: 'interaction-1' }] as never);
		expect(selector.isSelected({ id: 'interaction-1' } as never)).toBe(true);
		expect(selector.isSelected({ id: 'interaction-2' } as never)).toBe(false);
	});

	it('toggles a selection off again', () => {
		const fixture = buildFixture();
		const selector = fixture.componentInstance.selectedInteractions;

		selector.toggle({ id: 'interaction-1' } as never);
		expect(selector.selectedItems).toHaveLength(1);

		selector.toggle({ id: 'interaction-1' } as never);
		expect(selector.selectedItems).toEqual([]);
	});
});
