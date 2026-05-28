import { ProjectImportExportService } from './project-import-export.service';

describe('ProjectImportExportService', () => {
	function createService() {
		const service = Object.create(ProjectImportExportService.prototype) as any;
		service._projectTransferService = {
			exportProjectBundle: vi.fn().mockResolvedValue({ id: 'bundle-1' }),
			downloadProjectBundle: vi.fn(),
			importProjectBundle: vi.fn().mockResolvedValue({ projectId: 'project-1' }),
		};
		return service;
	}

	it('exports a project bundle and downloads it', async () => {
		const service = createService();

		await expect(service.exportProject('project-1')).resolves.toEqual({ id: 'bundle-1' });
		expect(service._projectTransferService.exportProjectBundle).toHaveBeenCalledWith('project-1');
		expect(service._projectTransferService.downloadProjectBundle).toHaveBeenCalledWith({ id: 'bundle-1' });
	});

	it('imports a project payload', async () => {
		const service = createService();

		await expect(service.importProject({ project: true })).resolves.toEqual({ projectId: 'project-1' });
		expect(service._projectTransferService.importProjectBundle).toHaveBeenCalledWith({ project: true });
	});
});
