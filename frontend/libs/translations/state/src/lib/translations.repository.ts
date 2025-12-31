import { GenericRepository } from '@foundation/table/state';
import { Translation } from '@foundation/translations/models';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TranslationsRepository extends GenericRepository<Translation> {
	constructor() {
		super('translation');
	}

	postManualTranslation$(translation: Translation) {
		return this._requestService.post$('/api/translations/manual', translation);
	}

	delete$(id: string) {
		return this._requestService.post$(`/api/translations/manual/${id}/delete`, {});
	}
}
