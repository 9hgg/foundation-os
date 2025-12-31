import { Injectable } from '@angular/core';
import { NEVER, Subject, filter, take, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

interface IframeScripts {
	iframe: HTMLIFrameElement | null;
	scripts: { [id: string]: string };
	salt: string;
	iframeId: string;
	iframeLoaded: boolean;
}

interface Payload {
	direction: 'toParent' | 'toIframe';
	iframeId: string;
	action: 'executeScript' | 'iframeLoaded';
	payload: any;
	scriptId?: string;
	reactionId?: string;
	salt: string;
}

@Injectable({
	providedIn: 'root',
})
export class IframeManagerService {
	private static readonly DEFAULT_SCRIPT_ID = 'defaultScript';
	private iframes: Map<string, IframeScripts> = new Map();

	/** subject to emit messages */
	private messageSubject = new Subject<Payload>();

	constructor() {
		window.addEventListener('message', (event: MessageEvent) => {
			// // Check if the origin of the message is trusted
			// if (event.origin && event.origin !== window.location.origin) {
			// 	console.warn('Untrusted origin:', event);
			// 	return; // Not a trusted origin, ignore the message
			// }

			if (event.data.direction !== 'toParent') {
				// console.log('[parent] ignore message:', event);

				return; // Not a message from an iframe, ignore the message
			}

			// Check if the message source is one of the iframes you created
			const isKnownIframe = Array.from(this.iframes.values()).some((iframeScripts) => iframeScripts.iframeId === event.data.iframeId && iframeScripts.salt === event.data.salt);
			if (!isKnownIframe) {
				console.warn('[parent] Unknown source:', event);
				return; // Unknown source, ignore the message
			}

			// console.log('[parent] Trusted message received:', event.data);

			if (event.data.action === 'iframeLoaded') {
				const iframeScripts = this.iframes.get(event.data.iframeId);
				if (iframeScripts) {
					iframeScripts.iframeLoaded = true;
					this.iframes.set(event.data.iframeId, iframeScripts);
					// console.log('[parent] iframe loaded:', event.data.iframeId, iframeScripts);
				} else {
					console.warn('[parent] iframe not found:', event.data.iframeId);
				}
			} else if (event.data.action === 'reaction') {
				this.messageSubject.next(event.data);
			} else {
				console.warn('[parent] Unknown action:', event.data.action, event.data);
			}
			// else if (event.data.kind === 'reactTo') {
			// 	const reactionId = event.data.reactionId;
			// 	const dataKey = event.data.dataKey;
			// 	console.log('[parent] reactTo:', { reactionId, dataKey });
			// }
		});

		// this.messageSubject
		// 	.pipe(
		// 		tap((data) => {
		// 			console.log('[parent] messageSubject:', data);
		// 		})
		// 	)
		// 	.subscribe();
	}

	defaultScript = (iframeScripts: IframeScripts) => `
		// no default script
  `;

	/**
	 * 1st step: add the script to the iframe and create the iframe if needed
	 * @param iframeId
	 * @param scriptId
	 * @param scriptText
	 */
	addScriptToIframe(iframeId: string, scriptId: string, scriptText: string): void {
		let iframeAndScripts = this.iframes.get(iframeId);
		if (!iframeAndScripts) {
			iframeAndScripts = { iframe: null, scripts: {}, salt: uuidv4(), iframeId, iframeLoaded: false };
			iframeAndScripts.scripts[IframeManagerService.DEFAULT_SCRIPT_ID] = this.defaultScript(iframeAndScripts);
		} else if (iframeAndScripts.scripts[scriptId] === scriptText) {
			// console.warn('[parent] Script already exists:', scriptId, scriptText);
			return;
		}
		console.log('%c[parent] Adding script to iframe:', 'color:orange', iframeId, scriptId, scriptText);
		iframeAndScripts.scripts[scriptId] = scriptText;
		this.iframes.set(iframeId, iframeAndScripts);
		this.upsertIframe(iframeId);
	}

	/**
	 * 2nd step: upsert the iframe in the DOM
	 * @param iframeId
	 */
	upsertIframe(iframeId: string): void {
		let iframeScripts = this.iframes.get(iframeId);
		if (!iframeScripts) {
			console.warn('%c[parent] (upsertIframe):', 'color: red', 'creating iframeSccripts from upsertIframe', iframeId);
			iframeScripts = { iframe: null, scripts: {}, salt: uuidv4(), iframeId, iframeLoaded: false };
			iframeScripts.scripts[IframeManagerService.DEFAULT_SCRIPT_ID] = this.defaultScript(iframeScripts);
		}

		const scriptFunctions = Object.entries(iframeScripts.scripts)
			.map(([key, scriptContent]) => {
				return `
				encapsulatedScripts["${key}"] = function(value,reactionId) {
				try {
					const result = (function(value) {
					${scriptContent}
					})(value)

					if (reactionId) {
						emit(result, 'reaction', reactionId);
					}
				} catch (error) {
					console.error('[iframe] Error in script execution:', error);
					if (reactionId) {
						emit(error, 'reaction', reactionId);
					}
				}
				};`;
			})
			.join('\n');

		const srcdoc = `
		<html>
		<head>
		  <script>
		  var encapsulatedScripts = {};
		  function emit(payload, action, reactionId) {
			window.parent.postMessage({ direction: 'toParent', iframeId: '${iframeScripts.iframeId}', payload: payload, action: action, reactionId: reactionId, salt: '${iframeScripts.salt}' }, '${window.location.origin}');
		  }
		  function markIframeLoaded() {
			  window.parent.postMessage({ direction: 'toParent', iframeId: '${iframeScripts.iframeId}', action: 'iframeLoaded', salt: '${iframeScripts.salt}' }, '${window.location.origin}');
		  }


		  window.addEventListener('message', (event) => {
			// Check if the origin of the message is trusted
			if (event.origin && event.origin !== '${window.location.origin}') {
				console.warn('[iframe] Untrusted origin:', event);
				return; // Not a trusted origin, ignore the message
			}
			const salt = '${iframeScripts.salt}';
			const iframeId = '${iframeScripts.iframeId}';

			// check if the message is for this iframe
			if (event.data.salt !== salt || event.data.iframeId !== iframeId || event.data.direction !== 'toIframe') {
				console.warn('[iframe] ignore message:', event);
				return; // Not intended for this iframe, ignore the message
			}

			// call the encapsulated script
			if (event.data.action === 'executeScript') {
				const scriptId = event.data.scriptId;
				const value = event.data.payload;
				const reactionId = event.data.reactionId;
				if (scriptId) {
					if (encapsulatedScripts[scriptId]) {
						encapsulatedScripts[scriptId](value, reactionId);
					}
				}
			}

		    });		  
		  </script>
		</head>
		<body>
			<script>
			  
              ${scriptFunctions}
			  markIframeLoaded();
			</script>
		</body>
		</html>
		`;

		let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
		if (!iframe) {
			console.log('%c[parent] (upsertIframe):', 'color: red', 'creating iframe', iframeId);
			iframe = document.createElement('iframe');
			iframe.id = iframeId;
			iframe.sandbox.add('allow-scripts');
			iframe.style.display = 'none';
			iframe.srcdoc = srcdoc;
			document.body.appendChild(iframe);
		} else {
			iframe.srcdoc = srcdoc;
		}

		iframeScripts.iframe = iframe;
		this.iframes.set(iframeId, iframeScripts);
	}

	/**
	 * 3rd step: execute the script in the iframe with an optional value
	 * @param iframeId
	 * @param scriptId
	 * @param value Optional value to pass to the script
	 */
	executeScriptInIframe(iframeId: string, scriptId: string, value?: any) {
		const iframeScripts = this.iframes.get(iframeId);
		if (!iframeScripts) {
			console.warn(`[parent] Cannot execute script in iframe: ${iframeId} does not exist.`);
			return NEVER;
		}
		const scriptContent = iframeScripts.scripts[scriptId];
		if (!scriptContent) {
			console.warn(`[parent] Script ID ${scriptId} does not exist in iframe: ${iframeId}`);
			return NEVER;
		}

		// Prepare payload with script details and optional value
		const payload: Payload = {
			direction: 'toIframe',
			iframeId: iframeId,
			salt: iframeScripts.salt,
			action: 'executeScript',
			scriptId: scriptId,
			payload: value,
			reactionId: uuidv4(),
		};

		// console.log(`[parent] Requesting execution of script in iframe: ${iframeId}, Script ID: ${scriptId}`, payload);
		this.sendMessageToIframe(payload);
		return this.messageSubject.pipe(
			filter((data) => !!payload.reactionId && data.reactionId === payload.reactionId),
			// tap((data) => {
			// 	console.log('[parent] messageSubject REACTION:', data);
			// }),
			take(1)
		);
	}

	/**
	 * 4th step: send the message to the iframe
	 * @param iframeId
	 * @param payload
	 * @returns
	 */
	sendMessageToIframe(payload: Payload): void {
		const iframeScripts = this.iframes.get(payload.iframeId);
		if (!iframeScripts) {
			console.warn('Unknown iframe:', payload.iframeId);
			return;
		}

		// console.log('[parent] Sending message to iframe:', payload, iframeScripts);
		// check if iframe is loaded
		if (!iframeScripts.iframeLoaded) {
			console.warn('[parent] iframe not loaded yet (postponing):', payload.iframeId);
			// postpone message by 50ms
			setTimeout(() => {
				this.sendMessageToIframe(payload);
			}, 50);
			return;
		}
		iframeScripts.iframe?.contentWindow?.postMessage(payload, '*');
	}
}
