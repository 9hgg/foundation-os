import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject, of } from 'rxjs';
import { FacilityBuilderPageComponent } from './facility-builder-page.component';

describe('FacilityBuilderPageComponent', () => {
	let getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let save: ReturnType<typeof vi.fn>;
	let paramMap$: BehaviorSubject<{ get: (key: string) => string | null }>;

	// The route id feeds the constructor's effect right away, so both the route value and the
	// repository mock must be configured before TestBed.createComponent()/detectChanges().
	const buildComponent = (facilityId: string | null = null, facility: Facility | null = null) => {
		paramMap$ = new BehaviorSubject({ get: (key: string) => (key === 'facilityId' ? facilityId : null) });
		getObjectByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(facility) });
		save = vi.fn();

		TestBed.configureTestingModule({
			imports: [FacilityBuilderPageComponent],
			providers: [
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
				{ provide: NotificationService, useValue: {} },
				{ provide: FacilitiesRepository, useValue: { store: { getObjectByIdPullOnce$$$, save } } },
			],
		});
		TestBed.overrideComponent(FacilityBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(FacilityBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('starts with no facility when the route carries no id', () => {
		const { component } = buildComponent();

		expect(component.facility$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('loads the facility named by the route', () => {
		const { component } = buildComponent('facility-1', { id: 'facility-1', name: 'Reactor Hall', type: 'testing' } as Facility);

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('facility-1');
		expect(component.facility$$$.value).toEqual({ id: 'facility-1', name: 'Reactor Hall', type: 'testing' });
	});

	it('reloads the facility when the route id changes', () => {
		const { component, fixture } = buildComponent('facility-1', { id: 'facility-1', name: 'Reactor Hall', type: 'testing' } as Facility);
		getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'facility-2', name: 'Cooling Tower', type: 'transverse' } as Facility) });

		paramMap$.next({ get: (key) => (key === 'facilityId' ? 'facility-2' : null) });
		fixture.detectChanges();

		expect(component.facilityId()).toBe('facility-2');
		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('facility-2');
		expect(component.facility$$$.value).toEqual({ id: 'facility-2', name: 'Cooling Tower', type: 'transverse' });
	});

	describe('updateName', () => {
		it('does nothing when no facility is loaded', () => {
			const { component } = buildComponent();

			component.updateName('New name');

			expect(save).not.toHaveBeenCalled();
		});

		it('saves the facility with the new name', () => {
			// facility$$$.value is a deep clone on every read (BehaviorSubjectReplayed), so the
			// mutate-then-save pattern in updateName only affects the object passed to save(),
			// not the store's held value -- that only changes once save's result flows back in.
			const { component } = buildComponent('facility-1', { id: 'facility-1', name: 'Old name', type: 'testing' } as Facility);

			component.updateName('New name');

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'facility-1', name: 'New name' }));
		});
	});

	describe('updateType', () => {
		it('does nothing when no facility is loaded', () => {
			const { component } = buildComponent();

			component.updateType('transverse');

			expect(save).not.toHaveBeenCalled();
		});

		it('saves the facility with the new type', () => {
			const { component } = buildComponent('facility-1', { id: 'facility-1', name: 'Reactor Hall', type: 'testing' } as Facility);

			component.updateType('transverse');

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'facility-1', type: 'transverse' }));
		});
	});
});
