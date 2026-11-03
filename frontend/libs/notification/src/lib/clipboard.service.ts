import { inject, Injectable } from '@angular/core';
import { TranslationService } from '@foundation/translations/services';
import { Observable, ReplaySubject } from 'rxjs';
import { NotificationService } from './notification.service';

/** Options driving how a copy is reported back to the user. */
export interface ClipboardCopyOptions {
	/** Show a success snack when the value was copied automatically. Defaults to true. */
	showSuccessSnack?: boolean;
	/** Message used for the success snack. Defaults to a translated "Copied to clipboard". */
	successMessage?: string;
}

/**
 * Copies text to the clipboard with graceful degradation.
 *
 * Browsers only expose the async Clipboard API (`navigator.clipboard`) in secure
 * contexts (https or localhost). When the app is served over plain http the API is
 * unavailable, so we fall back to the legacy `execCommand('copy')`, and finally to a
 * dialog showing the value so the user can select and copy it manually.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
	private _notificationService = inject(NotificationService);
	private _translationService = inject(TranslationService);

	private _i18n_copiedToClipboard = () => this._translationService.prep('Copied to clipboard')();
	private _i18n_manualCopyTitle = () => this._translationService.prep('Copy manually')();
	private _i18n_manualCopyMessage = () =>
		this._translationService.prep('Automatic copy is not available here. Select the text below and copy it (Ctrl/Cmd+C).')();
	private _i18n_done = () => this._translationService.prep('Done')();

	/**
	 * Copy a value to the clipboard.
	 *
	 * Emits `true` when the value was copied automatically (Clipboard API or
	 * `execCommand`), or `false` when neither worked and the manual-copy dialog was
	 * shown instead. The work starts eagerly (clipboard writes are sensitive to the
	 * user-gesture call stack) so the caller does not need to subscribe to trigger it.
	 */
	copy(value: string, options: ClipboardCopyOptions = {}): Observable<boolean> {
		const result$ = new ReplaySubject<boolean>(1);

		// Note: the synchronous part of _tryAutomaticCopy (including execCommand on the
		// http fallback) runs within this call, preserving the user gesture.
		this._tryAutomaticCopy(value)
			.then((wasCopiedAutomatically) => {
				if (wasCopiedAutomatically) {
					if (options.showSuccessSnack ?? true) {
						this._notificationService.snackSuccess(options.successMessage ?? this._i18n_copiedToClipboard());
					}
					result$.next(true);
					result$.complete();
					return;
				}

				// Could not copy automatically: let the user copy the value by hand.
				this._openManualCopyDialog(value).subscribe(() => {
					result$.next(false);
					result$.complete();
				});
			})
			.catch(() => {
				this._openManualCopyDialog(value).subscribe(() => {
					result$.next(false);
					result$.complete();
				});
			});

		return result$.asObservable();
	}

	private async _tryAutomaticCopy(value: string): Promise<boolean> {
		// Tier 1: async Clipboard API — only available in secure contexts (https / localhost).
		if (window.isSecureContext && navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(value);
				return true;
			} catch {
				// Permission denied or a transient failure: fall through to the legacy path.
			}
		}

		// Tier 2: legacy execCommand('copy') — still works over plain http in most browsers.
		return this._copyWithExecCommand(value);
	}

	private _copyWithExecCommand(value: string): boolean {
		try {
			const temporaryTextarea = document.createElement('textarea');
			temporaryTextarea.value = value;
			temporaryTextarea.setAttribute('readonly', '');
			// Keep it out of the viewport and non-interactive while still selectable.
			temporaryTextarea.style.position = 'fixed';
			temporaryTextarea.style.top = '-9999px';
			temporaryTextarea.style.opacity = '0';

			document.body.appendChild(temporaryTextarea);
			temporaryTextarea.select();
			const wasCopied = document.execCommand('copy');
			document.body.removeChild(temporaryTextarea);

			return wasCopied;
		} catch {
			return false;
		}
	}

	// We only wait for the dialog to close; the entered value is irrelevant here.
	private _openManualCopyDialog(value: string): Observable<unknown> {
		const numberOfLines = value.split('\n').length;
		const rows = Math.min(10, Math.max(3, numberOfLines));

		return this._notificationService.promptTextarea(this._i18n_manualCopyMessage(), this._i18n_manualCopyTitle(), {
			defaultValue: value,
			rows,
			confirmButtonText: this._i18n_done(),
		}).closed;
	}
}
