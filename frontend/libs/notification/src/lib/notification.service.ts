/* eslint-disable @angular-eslint/prefer-inject */
import { Dialog, DIALOG_DATA, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { CdkMenuModule } from '@angular/cdk/menu';
import { GlobalPositionStrategy, Overlay } from '@angular/cdk/overlay';
import { AfterViewInit, Component, ElementRef, Inject, inject, Injectable, OnDestroy, signal, viewChild } from '@angular/core';
import { TranslationService } from '@foundation/translations/services';
import Quill from 'quill';

interface DataType {
	title?: string;
	message?: string;
	dismissButtonText?: string;
}

interface ConfirmDataType extends DataType {
	confirmButtonText?: string;
	cancelButtonText?: string;
}

interface PromptDataType extends DataType {
	inputPlaceholder?: string;
	defaultValue?: string;
	confirmButtonText?: string;
	cancelButtonText?: string;
}

interface PromptTextareaDataType extends PromptDataType {
	rows?: number;
}

type PromptQuillTextareaDataType = PromptDataType;

interface SelectionOption {
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
}

interface SelectionDataType extends DataType {
	options: SelectionOption[];
	selectedValue?: string;
	confirmButtonText?: string;
	cancelButtonText?: string;
}

interface BaseDialogConfig<T = unknown> {
	width?: string;
	height?: string;
	maxWidth?: string;
	maxHeight?: string;
	closeDialogs?: '*' | string[];
	dialogTarget?: string;
	autoCloseMs?: number;
	callback?: (result: T | undefined) => void;
	snack?: boolean;
	snackPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	hasBackdrop?: boolean;
	disableClose?: boolean;
	positionStrategy?: DialogConfig['positionStrategy'];
}

// Specific configs per dialog type
type NotificationDialogConfig = BaseDialogConfig<void> & {
	data?: DataType;
	dismissButtonText?: string;
};
type PromptDialogConfig = BaseDialogConfig<{ value: string } | null> & {
	data?: PromptDataType;
	confirmButtonText?: string;
	cancelButtonText?: string;
	defaultValue?: string;
	inputPlaceholder?: string;
};
type PromptTextareaDialogConfig = BaseDialogConfig<{ value: string } | null> & {
	data?: PromptTextareaDataType;
	confirmButtonText?: string;
	cancelButtonText?: string;
	defaultValue?: string;
	inputPlaceholder?: string;
	rows?: number;
};
type PromptQuillTextareaDialogConfig = BaseDialogConfig<{ value: string } | null> & {
	data?: PromptQuillTextareaDataType;
	confirmButtonText?: string;
	cancelButtonText?: string;
	defaultValue?: string;
	inputPlaceholder?: string;
};
type ConfirmDialogConfig = BaseDialogConfig<boolean> & {
	data?: ConfirmDataType;
	confirmButtonText?: string;
	cancelButtonText?: string;
};
type SelectionDialogConfig = BaseDialogConfig<{ value: string } | null> & {
	data?: SelectionDataType;
	confirmButtonText?: string;
	cancelButtonText?: string;
};

type AnyDialogConfig = NotificationDialogConfig | PromptDialogConfig | PromptTextareaDialogConfig | PromptQuillTextareaDialogConfig | ConfirmDialogConfig | SelectionDialogConfig;

type AnyDialogRef =
	| DialogRef<void, NotificationDialogComponent>
	| DialogRef<void, SnackNotificationComponent>
	| DialogRef<{ value: string } | null, PromptDialogComponent>
	| DialogRef<{ value: string } | null, PromptTextareaDialogComponent>
	| DialogRef<{ value: string } | null, PromptQuillTextareaDialogComponent>
	| DialogRef<boolean, ConfirmationDialogComponent>
	| DialogRef<{ value: string } | null, SelectionDialogComponent>;

const DEFAULT_DIALOG_CONFIG: BaseDialogConfig & { snackPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' } = {
	width: 'auto',
	height: 'auto',
	maxWidth: '90%',
	maxHeight: '90%',
	snack: false,
	snackPosition: 'top-right',
	hasBackdrop: true,
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
	dialog = inject(Dialog);
	private _overlay = inject(Overlay);
	private _translationService = inject(TranslationService);
	dialogMap = new Map<string, { close: () => void }>();

	// Translation methods for common UI text (called at runtime for proper i18n)
	private _i18n_dismiss = () => this._translationService.prep('Dismiss')();
	private _i18n_confirm = () => this._translationService.prep('Confirm')();
	private _i18n_cancel = () => this._translationService.prep('Cancel')();
	private _i18n_submit = () => this._translationService.prep('Submit')();
	private _i18n_select = () => this._translationService.prep('Select')();
	private _i18n_warning = () => this._translationService.prep('WARNING')();
	private _i18n_success = () => this._translationService.prep('SUCCESS')();
	private _i18n_error = () => this._translationService.prep('ERROR')();

	private _closeDialogs(config: Pick<BaseDialogConfig, 'closeDialogs' | 'dialogTarget'>) {
		if (config.closeDialogs === '*') {
			this.dialog.closeAll();
		} else if (Array.isArray(config.closeDialogs)) {
			for (const id of config.closeDialogs) {
				const ref = this.dialogMap.get(id);
				if (ref) {
					ref.close();
					this.dialogMap.delete(id);
				}
			}
		}

		if (config.dialogTarget) {
			const existing = this.dialogMap.get(config.dialogTarget);
			if (existing) {
				existing.close();
				this.dialogMap.delete(config.dialogTarget);
			}
		}
	}

	private createSnackPositionStrategy(position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): GlobalPositionStrategy {
		const strategy = this._overlay.position().global();

		switch (position) {
			case 'top-left':
				return strategy.top('20px').left('20px');
			case 'top-right':
				return strategy.top('20px').right('20px');
			case 'bottom-left':
				return strategy.bottom('20px').left('20px');
			case 'bottom-right':
				return strategy.bottom('20px').right('20px');
			default:
				return strategy.top('20px').right('20px');
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation boundary: each overload guarantees the correct T at call sites
	private _finalizeDialogRef<TDialogResult, TDialogComponent>(dialogRef: DialogRef<TDialogResult, TDialogComponent>, config: BaseDialogConfig<any>): DialogRef<TDialogResult, TDialogComponent> {
		if (config.dialogTarget) {
			this.dialogMap.set(config.dialogTarget, { close: () => dialogRef.close() });
		}

		if (config.autoCloseMs && config.autoCloseMs > 0 && isFinite(config.autoCloseMs)) {
			setTimeout(() => {
				dialogRef.close();
				if (config.dialogTarget) {
					this.dialogMap.delete(config.dialogTarget);
				}
			}, config.autoCloseMs);
		}

		if (config.callback) {
			const callback = config.callback;
			console.log('Setting up callback for dialog close');
			dialogRef.closed.subscribe((result) => {
				console.log('Dialog closed with result:', result);
				callback(result);
			});
		}

		return dialogRef;
	}

	// Overloads
	private _openDialog(component: 'notification', config?: NotificationDialogConfig): DialogRef<void, NotificationDialogComponent>;
	private _openDialog(component: 'prompt', config?: PromptDialogConfig): DialogRef<{ value: string } | null, PromptDialogComponent>;
	private _openDialog(component: 'promptTextarea', config?: PromptTextareaDialogConfig): DialogRef<{ value: string } | null, PromptTextareaDialogComponent>;
	private _openDialog(component: 'promptQuillTextarea', config?: PromptQuillTextareaDialogConfig): DialogRef<{ value: string } | null, PromptQuillTextareaDialogComponent>;
	private _openDialog(component: 'confirm', config?: ConfirmDialogConfig): DialogRef<boolean, ConfirmationDialogComponent>;
	private _openDialog(component: 'selection', config?: SelectionDialogConfig): DialogRef<{ value: string } | null, SelectionDialogComponent>;

	// Implementation
	private _openDialog(
		component: 'notification' | 'prompt' | 'promptTextarea' | 'promptQuillTextarea' | 'confirm' | 'selection',
		_config: AnyDialogConfig = {}
	): AnyDialogRef {
		console.log('Original config:', _config);
		console.log('Default config:', DEFAULT_DIALOG_CONFIG);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dispatch hub: overloads guarantee correct types at call sites; config cannot be narrowed by the switch
		const config: BaseDialogConfig<any> = { ...DEFAULT_DIALOG_CONFIG, ..._config };
		this._closeDialogs(config);

		// Auto-configure for snack notifications
		if (config.snack) {
			config.hasBackdrop = config.hasBackdrop ?? false;
			config.disableClose = config.disableClose ?? false;
			// Set default auto-close for snacks if not specified
			if (config.autoCloseMs === undefined) {
				config.autoCloseMs = 5000;
			}

			if (config.snackPosition && !config.positionStrategy) {
				config.positionStrategy = this.createSnackPositionStrategy(config.snackPosition);
			}
		}

		console.log('Opening dialog with config:', config);

		switch (component) {
			case 'notification':
				if (config.snack) {
					const snackConfig = {
						...config,
						positionStrategy: config.positionStrategy || this.createSnackPositionStrategy(config.snackPosition ?? DEFAULT_DIALOG_CONFIG.snackPosition),
					};
					// Ensure autoCloseMs is available in the component via the config itself
					return this._finalizeDialogRef(this.dialog.open<void, DataType, SnackNotificationComponent>(SnackNotificationComponent, snackConfig), config);
				} else {
					return this._finalizeDialogRef(this.dialog.open<void, DataType, NotificationDialogComponent>(NotificationDialogComponent, {
						...config,
						backdropClass: 'cdk-overlay-dark-backdrop',
					}), config);
				}
			case 'prompt':
				return this._finalizeDialogRef(this.dialog.open<{ value: string } | null, PromptDataType, PromptDialogComponent>(PromptDialogComponent, {
					...config,
					backdropClass: 'cdk-overlay-dark-backdrop',
				}), config);
			case 'promptTextarea':
				return this._finalizeDialogRef(this.dialog.open<{ value: string } | null, PromptTextareaDataType, PromptTextareaDialogComponent>(PromptTextareaDialogComponent, {
					...config,
					backdropClass: 'cdk-overlay-dark-backdrop',
				}), config);
			case 'promptQuillTextarea':
				return this._finalizeDialogRef(this.dialog.open<{ value: string } | null, PromptQuillTextareaDataType, PromptQuillTextareaDialogComponent>(PromptQuillTextareaDialogComponent, {
					...config,
					backdropClass: 'cdk-overlay-dark-backdrop',
				}), config);
			case 'confirm':
				return this._finalizeDialogRef(this.dialog.open<boolean, ConfirmDataType, ConfirmationDialogComponent>(ConfirmationDialogComponent, {
					...config,
					backdropClass: 'cdk-overlay-dark-backdrop',
				}), config);
			case 'selection':
				return this._finalizeDialogRef(this.dialog.open<{ value: string } | null, SelectionDataType, SelectionDialogComponent>(SelectionDialogComponent, {
					...config,
					backdropClass: 'cdk-overlay-dark-backdrop',
				}), config);
			default:
				throw new Error('Unknown dialog component');
		}
	}

	notify(message?: string, title?: string, config: NotificationDialogConfig = {}) {
		return this._openDialog('notification', {
			...config,
			data: {
				message,
				title,
				dismissButtonText: config.dismissButtonText || this._i18n_dismiss(),
				...(config.data ?? {}),
			},
		});
	}

	warning(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_warning();
		console.warn(resolvedTitle, message);
		return this.notify(message, resolvedTitle, config);
	}

	success(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_success();
		return this.notify(message, resolvedTitle, config);
	}

	error(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_error();
		console.error(resolvedTitle, message);
		return this.notify(message, resolvedTitle, config);
	}

	confirm(message: string, title?: string, config: ConfirmDialogConfig = {}) {
		return this._openDialog('confirm', {
			...config,
			data: {
				message,
				title,
				confirmButtonText: config.confirmButtonText || this._i18n_confirm(),
				cancelButtonText: config.cancelButtonText || this._i18n_cancel(),
				...(config.data ?? {}),
			},
		});
	}

	prompt(message?: string, title?: string, config: PromptDialogConfig = {}) {
		return this._openDialog('prompt', {
			...config,
			data: {
				message,
				title,
				defaultValue: config.defaultValue,
				inputPlaceholder: config.inputPlaceholder,
				confirmButtonText: config.confirmButtonText || this._i18n_submit(),
				cancelButtonText: config.cancelButtonText || this._i18n_cancel(),
				...(config.data ?? {}),
			},
		});
	}

	promptTextarea(message?: string, title?: string, config: PromptTextareaDialogConfig = {}) {
		return this._openDialog('promptTextarea', {
			...config,
			data: {
				message,
				title,
				rows: config.rows,
				defaultValue: config.defaultValue,
				inputPlaceholder: config.inputPlaceholder,
				confirmButtonText: config.confirmButtonText || this._i18n_submit(),
				cancelButtonText: config.cancelButtonText || this._i18n_cancel(),
				...(config.data ?? {}),
			},
		});
	}

	promptQuillTextarea(message?: string, title?: string, config: PromptQuillTextareaDialogConfig = {}) {
		return this._openDialog('promptQuillTextarea', {
			...config,
			data: {
				message,
				title,
				defaultValue: config.defaultValue,
				inputPlaceholder: config.inputPlaceholder,
				confirmButtonText: config.confirmButtonText || this._i18n_submit(),
				cancelButtonText: config.cancelButtonText || this._i18n_cancel(),
				...(config.data ?? {}),
			},
		});
	}

	selectFromOptions(options: SelectionOption[], title?: string, message?: string, selectedValue?: string, config: SelectionDialogConfig = {}) {
		return this._openDialog('selection', {
			...config,
			data: {
				options,
				title,
				message,
				selectedValue,
				confirmButtonText: config.confirmButtonText || this._i18n_select(),
				cancelButtonText: config.cancelButtonText || this._i18n_cancel(),
				...(config.data ?? {}),
			},
		});
	}

	snack(message?: string, title?: string, config: NotificationDialogConfig = {}) {
		return this._openDialog('notification', {
			...config,
			snack: true,
			autoCloseMs: config.autoCloseMs || 5000, // Auto-close snacks after 5 seconds by default
			data: {
				message,
				title,
				...(config.data ?? {}),
			},
		});
	}

	snackSuccess(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_success();
		return this.snack(message, resolvedTitle, config);
	}

	snackError(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_error();
		console.error(resolvedTitle, message);
		return this.snack(message, resolvedTitle, config);
	}

	snackWarning(message: string, title?: string, config: NotificationDialogConfig = {}) {
		const resolvedTitle = title ?? this._i18n_warning();
		console.warn(resolvedTitle, message);
		return this.snack(message, resolvedTitle, config);
	}
}

// simple notification component with a dismiss button
@Component({
	selector: 'lib-notification-dialog',
	standalone: true,
	template: `
		<div class="modal-box bg-base-100 text-base-content w-96 max-w-lg rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-info/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-info h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="title"
				></h3>
			</div>

			<!-- Content -->
			<div class="px-6 py-5">
				<div
					class="text-sm opacity-80"
					[innerHTML]="message"
				></div>
			</div>

			<!-- Actions -->
			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-primary"
					(click)="dialogRef.close()"
				>
					<span [innerHTML]="dismissButtonText"></span>
				</button>
			</div>
		</div>
	`,
})
export class NotificationDialogComponent {
	dialogRef = inject(DialogRef);
	private _translationService = inject(TranslationService);

	title?: string;
	message?: string;
	dismissButtonText: string;

	constructor() {
		const data = this.dialogRef.config.data;
		this.title = data.title;
		this.message = data.message;
		this.dismissButtonText = data.dismissButtonText || this._translationService.prep('Dismiss')();
	}
}

// simple confirmation component with a confirm and cancel button (editable)
@Component({
	selector: 'lib-confirmation-dialog',
	standalone: true,
	template: `
		<div class="modal-box bg-base-100 text-base-content w-96 max-w-lg rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-warning/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-warning h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="title"
				></h3>
			</div>

			<!-- Content -->
			<div class="px-6 py-5">
				<p
					class="text-sm opacity-80"
					[innerHTML]="message"
				></p>
			</div>

			<!-- Actions -->
			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-ghost"
					(click)="dialogRef.close(false)"
				>
					<span [innerHTML]="cancelButtonText"></span>
				</button>
				<button
					type="button"
					class="btn btn-primary"
					(click)="dialogRef.close(true)"
				>
					<span [innerHTML]="confirmButtonText"></span>
				</button>
			</div>
		</div>
	`,
})
export class ConfirmationDialogComponent {
	dialogRef = inject(DialogRef);
	private _translationService = inject(TranslationService);

	title?: string;
	message?: string;
	confirmButtonText: string;
	cancelButtonText: string;

	constructor() {
		const data = this.dialogRef.config.data;
		this.title = data.title;
		this.message = data.message;
		this.confirmButtonText = data.confirmButtonText || this._translationService.prep('Confirm')();
		this.cancelButtonText = data.cancelButtonText || this._translationService.prep('Cancel')();
	}
}

// Prompt component with a title, a message, an input field and a button
@Component({
	selector: 'lib-prompt-dialog',
	standalone: true,
	template: `
		<div class="modal-box bg-base-100 text-base-content w-96 max-w-lg rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-primary h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="promptModalData.title"
				></h3>
			</div>

			<!-- Content -->
			<div class="px-6 py-5">
				@if (promptModalData.message) {
					<p
						class="mb-4 text-sm opacity-70"
						[innerHTML]="promptModalData.message"
					></p>
				}

				<div class="form-control w-full">
					<label
						for="content-name"
						class="mb-2 text-xs font-medium opacity-60"
						>Your input</label
					>
					<input
						id="content-name"
						name="content-name"
						type="text"
						class="input input-bordered w-full"
						[placeholder]="promptModalData.inputPlaceholder ?? 'Enter your input...'"
						#input
						[value]="promptModalData.defaultValue || ''"
						(keyup.enter)="dialogRef.close({ value: input.value })"
						(focus)="input.select()"
					/>
				</div>
			</div>

			<!-- Actions -->
			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-ghost"
					(click)="dialogRef.close(null)"
				>
					<span [innerHTML]="promptModalData.cancelButtonText || 'Cancel'"></span>
				</button>
				<button
					type="button"
					class="btn btn-primary"
					(click)="dialogRef.close({ value: input.value })"
				>
					<span [innerHTML]="promptModalData.confirmButtonText || 'Submit'"></span>
				</button>
			</div>
		</div>
	`,
})
export class PromptDialogComponent {
	dialogRef = inject(DialogRef<{ value: string } | null, PromptDialogComponent>);
	constructor(@Inject(DIALOG_DATA) public promptModalData: DataType & PromptDataType) {
		console.log('PromptDialogComponent', promptModalData);
	}
}

@Component({
	selector: 'lib-prompt-textarea-dialog',
	template: `
		<div class="modal-box bg-base-100 text-base-content w-full max-w-lg rounded-2xl p-0 shadow-2xl">
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-primary h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="promptTextareaModalData.title"
				></h3>
			</div>

			<div class="px-6 py-5">
				@if (promptTextareaModalData.message) {
					<p
						class="mb-4 text-sm opacity-70"
						[innerHTML]="promptTextareaModalData.message"
					></p>
				}

				<div class="form-control w-full">
					<label
						for="prompt-textarea-input"
						class="mb-2 text-xs font-medium opacity-60"
						>Content</label
					>
					<textarea
						id="prompt-textarea-input"
						name="prompt-textarea-input"
						class="textarea textarea-bordered min-h-32 w-full"
						[rows]="promptTextareaModalData.rows ?? 6"
						[placeholder]="promptTextareaModalData.inputPlaceholder ?? ''"
						[value]="promptTextareaModalData.defaultValue || ''"
						#textareaInput
					></textarea>
				</div>
			</div>

			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-ghost"
					(click)="dialogRef.close(null)"
				>
					<span [innerHTML]="promptTextareaModalData.cancelButtonText || 'Cancel'"></span>
				</button>
				<button
					type="button"
					class="btn btn-primary"
					(click)="dialogRef.close({ value: textareaInput.value })"
				>
					<span [innerHTML]="promptTextareaModalData.confirmButtonText || 'Submit'"></span>
				</button>
			</div>
		</div>
	`,
})
export class PromptTextareaDialogComponent {
	dialogRef = inject(DialogRef<{ value: string } | null, PromptTextareaDialogComponent>);

	constructor(@Inject(DIALOG_DATA) public promptTextareaModalData: PromptTextareaDataType) {
		console.log('PromptTextareaDialogComponent', promptTextareaModalData);
	}
}

@Component({
	selector: 'lib-prompt-quill-textarea-dialog',
	template: `
		<div class="modal-box bg-base-100 text-base-content h-[80vh] w-full max-w-3xl rounded-2xl p-0 shadow-2xl">
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-primary h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M11 5h10M11 9h7M11 13h9M11 17h6M4 5h.01M4 9h.01M4 13h.01M4 17h.01"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="promptQuillTextareaModalData.title"
				></h3>
			</div>

			<div class="flex h-[calc(80vh-8.5rem)] flex-col px-6 py-5">
				@if (promptQuillTextareaModalData.message) {
					<p
						class="mb-4 text-sm opacity-70"
						[innerHTML]="promptQuillTextareaModalData.message"
					></p>
				}

				@if (promptQuillTextareaModalData.inputPlaceholder) {
					<p class="mb-2 text-xs opacity-60">{{ promptQuillTextareaModalData.inputPlaceholder }}</p>
				}

				<div class="min-h-0 flex-1 overflow-auto rounded-xl border border-base-200 p-3">
					<div
						#quillContainer
						class="bg-base-100 h-full min-h-56 rounded-md"
					></div>
				</div>
			</div>

			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-ghost"
					(click)="dialogRef.close(null)"
				>
					<span [innerHTML]="promptQuillTextareaModalData.cancelButtonText || 'Cancel'"></span>
				</button>
				<button
					type="button"
					class="btn btn-primary"
					(click)="dialogRef.close({ value: editorValue() })"
				>
					<span [innerHTML]="promptQuillTextareaModalData.confirmButtonText || 'Submit'"></span>
				</button>
			</div>
		</div>
	`,
})
export class PromptQuillTextareaDialogComponent implements AfterViewInit, OnDestroy {
	dialogRef = inject(DialogRef<{ value: string } | null, PromptQuillTextareaDialogComponent>);
	quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	editorValue = signal<string>('');
	private _quillInstance: Quill | null = null;
	private _onEditorChange = () => {
		if (!this._quillInstance) {
			return;
		}
		this.editorValue.set(this._quillInstance.getSemanticHTML());
	};

	constructor(@Inject(DIALOG_DATA) public promptQuillTextareaModalData: PromptQuillTextareaDataType) {
		this.editorValue.set(promptQuillTextareaModalData.defaultValue ?? '');
		console.log('PromptQuillTextareaDialogComponent', promptQuillTextareaModalData);
	}

	ngAfterViewInit() {
		const quillContainerElement = this.quillContainer()?.nativeElement;
		if (!quillContainerElement) {
			return;
		}

		this._quillInstance = new Quill(quillContainerElement, {
			theme: 'snow',
			placeholder: this.promptQuillTextareaModalData.inputPlaceholder,
			modules: {
				toolbar: [
					['bold', 'italic', 'underline', 'strike'],
					[{ list: 'ordered' }, { list: 'bullet' }],
					['link'],
					['clean'],
				],
			},
		});

		const initialEditorValue = this.editorValue();
		if (initialEditorValue) {
			this._quillInstance.clipboard.dangerouslyPasteHTML(initialEditorValue);
		}

		this._quillInstance.on('text-change', this._onEditorChange);
	}

	ngOnDestroy() {
		if (!this._quillInstance) {
			return;
		}

		this._quillInstance.off('text-change', this._onEditorChange);
		this._quillInstance = null;
	}
}

// Selection component with a title, a message, and selectable options
@Component({
	selector: 'lib-selection-dialog',
	standalone: true,
	imports: [CdkMenuModule],
	template: `
		<div class="modal-box bg-base-100 text-base-content flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="border-base-200 flex items-center gap-3 border-b px-6 py-4">
				<div class="bg-secondary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg
						class="text-secondary h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
						/>
					</svg>
				</div>
				<h3
					class="text-lg font-semibold"
					[innerHTML]="selectionModalData.title"
				></h3>
			</div>

			<!-- Content -->
			<div class="flex min-h-0 flex-1 flex-col px-6 py-5">
				@if (selectionModalData.message) {
					<p
						class="mb-5 text-sm opacity-80"
						[innerHTML]="selectionModalData.message"
					></p>
				}

				<div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
					@for (option of selectionModalData.options; track option.value) {
						<div
							class="group rounded-xl border-2 transition-all duration-200"
							[class]="option.disabled ? 'border-base-200 bg-base-200 cursor-not-allowed opacity-60' : option.value === selectedValue ? 'border-secondary bg-secondary/10 cursor-pointer shadow-sm' : 'border-base-200 bg-base-100 hover:border-base-300 hover:bg-base-200 cursor-pointer'"
							(click)="!option.disabled && selectOption(option.value)"
							[attr.role]="option.disabled ? null : 'button'"
							[attr.tabindex]="option.disabled ? -1 : 0"
							(keyup.enter)="!option.disabled && selectOption(option.value)"
							(keyup.space)="!option.disabled && selectOption(option.value)"
							[attr.title]="option.disabled ? option.description || 'This option is not available' : null"
						>
							<div class="flex items-center justify-between p-3">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-3">
										<!-- Radio button visual -->
										<div class="shrink-0">
											<div
												class="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200"
												[class]="option.disabled ? 'border-base-300 bg-base-200' : option.value === selectedValue ? 'border-secondary bg-secondary' : 'border-base-300 group-hover:border-secondary/50'"
											>
												@if (option.value === selectedValue && !option.disabled) {
													<div class="bg-base-100 h-2 w-2 rounded-full"></div>
												}
											</div>
										</div>

										<div class="min-w-0 flex-1">
											<div
												class="font-medium transition-colors duration-200"
												[class]="option.disabled ? 'opacity-50' : option.value === selectedValue ? 'text-secondary' : ''"
												[innerHTML]="option.label"
											></div>
											@if (option.description) {
												<div
													class="mt-0.5 text-xs transition-colors duration-200"
													[class]="option.disabled ? 'opacity-40' : option.value === selectedValue ? 'text-secondary/70' : 'opacity-60'"
													[innerHTML]="option.description"
												></div>
											}
										</div>
									</div>
								</div>

								<!-- Selected checkmark -->
								@if (option.value === selectedValue && !option.disabled) {
									<div class="ml-4 shrink-0">
										<div class="animate-in zoom-in bg-secondary text-secondary-content flex h-6 w-6 items-center justify-center rounded-full duration-200">
											<svg
												class="h-3.5 w-3.5"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												></path>
											</svg>
										</div>
									</div>
								}
							</div>
						</div>
					}
				</div>
			</div>

			<!-- Actions -->
			<div class="border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					type="button"
					class="btn btn-ghost"
					(click)="dialogRef.close(null)"
				>
					<span [innerHTML]="selectionModalData.cancelButtonText || 'Cancel'"></span>
				</button>
				<button
					type="button"
					class="btn"
					[class]="selectedValue && !isSelectedOptionDisabled() ? 'btn-secondary' : 'btn-disabled'"
					[disabled]="!selectedValue || isSelectedOptionDisabled()"
					(click)="!isSelectedOptionDisabled() && dialogRef.close({ value: selectedValue || '' })"
				>
					<span [innerHTML]="selectionModalData.confirmButtonText || 'Select'"></span>
				</button>
			</div>
		</div>
	`,
})
export class SelectionDialogComponent {
	dialogRef = inject(DialogRef<{ value: string } | null, SelectionDialogComponent>);
	selectedValue: string | undefined;

	constructor(@Inject(DIALOG_DATA) public selectionModalData: SelectionDataType) {
		console.log('SelectionDialogComponent', selectionModalData);
		this.selectedValue = selectionModalData.selectedValue;
	}

	selectOption(value: string) {
		// Check if the option is disabled
		const option = this.selectionModalData.options.find((opt) => opt.value === value);
		if (option?.disabled) {
			return; // Don't allow selection of disabled options
		}
		this.selectedValue = value;
	}

	isSelectedOptionDisabled(): boolean {
		if (!this.selectedValue) {
			return false;
		}
		const option = this.selectionModalData.options.find((opt) => opt.value === this.selectedValue);
		return option?.disabled || false;
	}
}

// Snack notification component (toast-style)
@Component({
	selector: 'lib-snack-notification',
	standalone: true,
	template: `
		<div
			class="border-base-200 bg-base-100 text-base-content relative w-full max-w-sm overflow-hidden rounded-lg border shadow-xl transition-all duration-300"
			(mouseenter)="onHover(true)"
			(mouseleave)="onHover(false)"
		>
			<!-- Progress bar (only show if autoClose is enabled) -->
			@if (showProgressBar()) {
				<div class="bg-base-200 absolute top-0 left-0 h-1 w-full">
					<div
						class="bg-info h-full transition-all ease-linear"
						[style.width.%]="progressPercentage()"
						[style.transition-duration]="isHovered() ? '0ms' : progressTransitionDuration() + 'ms'"
					></div>
				</div>
			}

			<!-- Header with icon and dismiss button -->
			<div
				class="flex items-start gap-3 p-4"
				[class.pt-5]="showProgressBar()"
			>
				<div class="shrink-0">
					<div class="bg-info/10 text-info flex h-8 w-8 items-center justify-center rounded-full">
						<svg
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
				</div>
				<div class="min-w-0 flex-1">
					@if (title) {
						<h4
							class="text-base-content mb-1 text-sm font-bold"
							[innerHTML]="title"
						></h4>
					}
					<p
						class="text-base-content/80 text-sm"
						[innerHTML]="message"
					></p>
				</div>
				<button
					type="button"
					class="btn btn-xs btn-ghost btn-square"
					(click)="dialogRef.close()"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
		</div>
	`,
})
export class SnackNotificationComponent {
	dialogRef = inject(DialogRef);

	title?: string;
	message?: string;
	autoCloseMs?: number;
	showProgressBar = signal(false);
	progressPercentage = signal(0); // Start at 0%
	progressTransitionDuration = signal(0);
	isHovered = signal(false);

	private startTime?: number;
	private remainingTime?: number;

	constructor() {
		const data = this.dialogRef.config.data;
		const autoCloseCandidate = Reflect.get(this.dialogRef.config, 'autoCloseMs');

		this.title = data.title;
		this.message = data.message;
		// Get autoCloseMs from the config
		this.autoCloseMs = typeof autoCloseCandidate === 'number' ? autoCloseCandidate : undefined;

		console.log('SnackNotificationComponent - autoCloseMs:', this.autoCloseMs);

		// Show progress bar only if autoClose is positive and finite
		this.showProgressBar.set(!!(this.autoCloseMs && this.autoCloseMs > 0 && isFinite(this.autoCloseMs)));

		console.log('SnackNotificationComponent - showProgressBar:', this.showProgressBar());

		if (this.showProgressBar()) {
			this.startProgressBar();
		}
	}

	private startProgressBar() {
		if (!this.autoCloseMs) return;

		console.log('Starting progress bar with duration:', this.autoCloseMs);

		this.startTime = Date.now();
		this.remainingTime = this.autoCloseMs;

		// Use CSS transition for smooth animation
		this.progressTransitionDuration.set(this.autoCloseMs);
		this.progressPercentage.set(0); // Start empty

		console.log('Initial values - percentage:', this.progressPercentage(), 'duration:', this.progressTransitionDuration());

		// Start the progress animation after a small delay to ensure CSS transition applies
		setTimeout(() => {
			console.log('Setting progress to 100%');
			this.progressPercentage.set(100); // Fill to 100%
		}, 50);
	}

	onHover(hovered: boolean) {
		this.isHovered.set(hovered);

		if (!this.showProgressBar() || !this.autoCloseMs) return;

		if (hovered) {
			// Pause progress when hovered - calculate current progress and stop transition
			if (this.startTime) {
				const elapsed = Date.now() - this.startTime;
				const progress = Math.min(elapsed / this.autoCloseMs, 1);
				this.progressPercentage.set(progress * 100); // Fill progress from 0 to 100
				this.remainingTime = Math.max(0, this.autoCloseMs - elapsed);
				// Remove transition to freeze the bar
				this.progressTransitionDuration.set(0);
			}
		} else {
			// Resume progress when not hovered
			if (this.remainingTime && this.remainingTime > 0) {
				this.startTime = Date.now();
				this.progressTransitionDuration.set(this.remainingTime);

				// Resume animation to 100%
				setTimeout(() => {
					this.progressPercentage.set(100);
				}, 50);
			}
		}
	}
}

/* Add these styles to your global styles or component styles */
/*
	.snack-notification {
		pointer-events: auto;
	}
	
	.snack-notification .cdk-overlay-pane {
		position: static !important;
	}
	*/
