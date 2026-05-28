import { of } from 'rxjs';
import { ProjectBuilderMenuComponent } from './project-builder-menu.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectBuilderMenuComponent', () => {
	function createComponent() {
		const component = Object.create(ProjectBuilderMenuComponent.prototype) as any;
		component.patchableProject = {
			updateField: vi.fn(),
			patchedItem: vi.fn(() => ({ id: 'project-1' })),
		};
		component._customersModals = {
			openCustomerSelectDialog: vi.fn().mockReturnValue({ closed: of({ customers: [{ id: 'customer-1' }] }) }),
		};
		component._contributorsModals = {
			openContributorSelectDialog: vi.fn().mockReturnValue({ closed: of({ contributors: [{ id: 'contributor-1' }] }) }),
		};
		component._projectImportExportService = {
			exportProject: vi.fn().mockResolvedValue(undefined),
			importProject: vi.fn().mockResolvedValue({ projectId: 'project-imported' }),
		};
		component._notificationService = {
			snackSuccess: vi.fn(),
			error: vi.fn(),
		};
		component._projectsRepository = {
			goToProject: vi.fn(),
		};
		component.isTransferringProject = createSignal(false);
		return component;
	}

	it('formats dates and updates linked customers and contributors', () => {
		const component = createComponent();

		expect(component.formatDate()).toBe('');
		expect(component.formatDate('2026-04-22T09:15:00Z')).toBe('2026-04-22');
		expect(component.formatDate('2026-04-22-extra')).toBe('2026-04-22');
		expect(component._toErrorMessage(new Error('boom'))).toBe('boom');
		expect(component._toErrorMessage('boom')).toBe('Unexpected error');

		component.openSelectCustomer('main');
		component.openSelectCustomer('sponsor');
		component.clearCustomer('main');
		component.clearCustomer('sponsor');
		component.openSelectContributor('pm');
		component.openSelectContributor('strategic');
		component.clearContributor('pm');
		component.clearContributor('strategic');

		expect(component._customersModals.openCustomerSelectDialog).toHaveBeenCalled();
		expect(component._contributorsModals.openContributorSelectDialog).toHaveBeenCalled();
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.mainCustomerId', 'customer-1');
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.sponsorCustomerId', 'customer-1');
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.projectManagerContributorId', 'contributor-1');
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.strategicLeadContributorId', 'contributor-1');
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.mainCustomerId', undefined);
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.sponsorCustomerId', undefined);
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.projectManagerContributorId', undefined);
		expect(component.patchableProject.updateField).toHaveBeenCalledWith('config.strategicLeadContributorId', undefined);
	});

	it('exports a project and reports success or failure', async () => {
		const component = createComponent();

		await component.exportProject();
		expect(component.isTransferringProject()).toBe(false);
		expect(component._projectImportExportService.exportProject).toHaveBeenCalledWith('project-1');
		expect(component._notificationService.snackSuccess).toHaveBeenCalledWith('Project exported successfully.');

		component._projectImportExportService.exportProject.mockRejectedValueOnce(new Error('transfer failed'));
		await component.exportProject();
		expect(component._notificationService.error).toHaveBeenCalledWith('Project export failed: transfer failed');
	});

	it('imports a project file, navigates on success, and resets the input', async () => {
		const component = createComponent();
		const click = vi.fn();
		const inputForClick = { click } as unknown as HTMLInputElement;
		component.triggerImport(inputForClick);
		expect(click).toHaveBeenCalled();

		const input = {
			files: [
				{
					text: vi.fn().mockResolvedValue('{"project":"payload"}'),
				},
			],
			value: 'chosen-file',
		};

		await component.importProjectFromFile({ target: input } as any);

		expect(component._projectImportExportService.importProject).toHaveBeenCalledWith({ project: 'payload' });
		expect(component._notificationService.snackSuccess).toHaveBeenCalledWith('Project imported successfully.');
		expect(component._projectsRepository.goToProject).toHaveBeenCalledWith('project-imported');
		expect(input.value).toBe('');
		expect(component.isTransferringProject()).toBe(false);
	});

	it('handles missing or invalid import files', async () => {
		const component = createComponent();

		await component.importProjectFromFile({ target: { files: [], value: 'x' } } as any);
		expect(component._projectImportExportService.importProject).not.toHaveBeenCalled();

		component._projectImportExportService.importProject.mockRejectedValueOnce(new Error('bad file'));
		const input = {
			files: [
				{
					text: vi.fn().mockResolvedValue('{"broken":true}'),
				},
			],
			value: 'chosen-file',
		};

		await component.importProjectFromFile({ target: input } as any);

		expect(component._notificationService.error).toHaveBeenCalledWith('Project import failed: bad file');
		expect(input.value).toBe('');
		expect(component.isTransferringProject()).toBe(false);
	});
});
