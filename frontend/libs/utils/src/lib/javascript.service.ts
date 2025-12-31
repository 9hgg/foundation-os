import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root',
})
export class JavascriptService {
	/**
	 *
	 * @param futureContainerId the id of the container where the script will be added
	 * @param src source url of the script
	 * @param onload callback when the script is loaded
	 * @optional parentElement the element where the script will be added
	 */
	loadScript(futureContainerId: string, src: string, onload: ((this: GlobalEventHandlers, ev: Event) => any) | null = null, parentElement?: HTMLElement): void {
		console.log('[javascriptService](loadScript)', futureContainerId);

		if (typeof document !== 'undefined' && !document.getElementById(futureContainerId)) {
			const signInJs = document.createElement('script');

			signInJs.async = true;
			signInJs.src = src;
			signInJs.onload = onload;

			if (!parentElement) {
				parentElement = document.head;
			}
			parentElement.appendChild(signInJs);
		} else {
			console.log('[javascriptService](loadScript)', 'script already loaded');
		}
	}
}
