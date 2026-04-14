import { Injectable, inject } from '@angular/core';
import { ProjectImportResult, ProjectTransferBundle, ProjectTransferService } from './project-transfer.service';

@Injectable({ providedIn: 'root' })
export class ProjectImportExportService {
	private _projectTransferService = inject(ProjectTransferService);

	public async exportProject(projectId: string): Promise<ProjectTransferBundle> {
		const bundle = await this._projectTransferService.exportProjectBundle(projectId);
		this._projectTransferService.downloadProjectBundle(bundle);
		return bundle;
	}

	public async importProject(payload: unknown): Promise<ProjectImportResult> {
		return this._projectTransferService.importProjectBundle(payload);
	}
}
