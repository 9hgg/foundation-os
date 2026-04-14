import { Injectable } from '@angular/core';
import { Contributor, ContributorPreviewRow } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class ContributorsRepository extends GenericRepository<Contributor> {
	constructor() {
		super('contributors', '/api/edf/rand/contributors');
	}

	public goToContributor(contributorId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'contributors', contributorId, 'builder']);
	}

	/** Import contributors from an existing file (fileId). Optionally provide `onlyNames` to import a subset. */
	public importFromFile$(fileId: string, onlyNames?: string[]) {
		return this._requestService.post$<{ inserted: number; updated: number; skipped: number; errors: { name: string; error: string }[] }>(
			`${this.api_url}/import-from-file`,
			{ fileId, onlyNames }
		);
	}

	/** Preview extraction from an existing file (does not insert). */
	public previewFromFile$(fileId: string) {
		return this._requestService.post$<ContributorPreviewRow[]>(
			`${this.api_url}/preview-from-file`,
			{ fileId }
		);
	}

	/** Purge all contributors - admin only */
	public purgeAll$() {
		return this._requestService.post$<{ deleted_contributors: number; deleted_acls: number }>(
			`${this.api_url}/purge`,
			{}
		);
	}
}
