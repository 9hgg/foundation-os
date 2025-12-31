import { RequestService } from '@foundation/network/services';
import { SmartRestStore } from '@foundation/network/store';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export abstract class GenericRepository<T extends { id: string }> {
	protected _router = inject(Router);
	protected _requestService = inject(RequestService);
	protected _notificationService = inject(NotificationService);
	protected _translationService = inject(TranslationService);

	store: SmartRestStore<T>;
	api_url: string;
	kind: string;
	constructor(kind: string, api_url?: string) {
		this.api_url = api_url ?? '/api/' + kind + 's';
		this.kind = kind;
		this.store = new SmartRestStore<T>(this.api_url, this.kind);
	}
}
