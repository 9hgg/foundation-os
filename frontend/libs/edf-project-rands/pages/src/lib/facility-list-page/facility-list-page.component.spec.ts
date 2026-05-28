import { of } from 'rxjs';
import { FacilityListPageComponent } from './facility-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'facility-uuid' }));

describe('FacilityListPageComponent', () => {
	function createComponent() {
		const component = Object.create(FacilityListPageComponent.prototype) as any;
		component.facilitiesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'facility-created' } } })),
			},
			goToFacility: vi.fn(),
		};
		component._facilitiesModals = {
			openFacilityCreateDialog: vi.fn().mockReturnValue({
				closed: of({ name: 'Lab', type: 'platform' }),
			}),
		};
		return component;
	}

	it('creates a facility and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.facilitiesRepository.store.postObject$).toHaveBeenCalledWith({
			id: 'facility-uuid',
			name: 'Lab',
			type: 'platform',
		});
		expect(component.facilitiesRepository.goToFacility).toHaveBeenCalledWith('facility-created');
	});

	it('ignores cancelled facility creation', () => {
		const component = createComponent();
		component._facilitiesModals.openFacilityCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.facilitiesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.facilitiesRepository.goToFacility).not.toHaveBeenCalled();
	});
});
