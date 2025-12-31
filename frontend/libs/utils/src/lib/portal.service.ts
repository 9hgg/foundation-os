import { Portal } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { BehaviorSubjectReplayed } from './utils';

@Injectable({
	providedIn: 'root',
})
export class PortalService {
	private _portals$$$Map = new Map<string, BehaviorSubjectReplayed<Portal<any> | null>>();

	updatePortal(key: string, portal: Portal<any> | null) {
		let portal$$$ = this._portals$$$Map.get(key);
		if (portal$$$) {
			portal$$$.next(portal);
		} else {
			portal$$$ = new BehaviorSubjectReplayed<Portal<any> | null>(portal);
			this._portals$$$Map.set(key, portal$$$);
		}
	}

	getPortal$$$(key: string): BehaviorSubjectReplayed<Portal<any> | null> {
		let portal$$$ = this._portals$$$Map.get(key);
		if (!portal$$$) {
			portal$$$ = new BehaviorSubjectReplayed<Portal<any> | null>(null);
			this._portals$$$Map.set(key, portal$$$);
		}
		return portal$$$;
	}
}
