import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import {
	FeedbackBlock,
	FeedbackBlockResponse,
	FeedbackConfig,
	FileFeedbackBlock,
	MCQFeedbackBlock,
	NPSFeedbackBlock,
	RatingFeedbackBlock,
	SupportTicketFeedbackBlock,
	TextareaFeedbackBlock,
	TextFeedbackBlock,
} from '@foundation/feedback/models';
import { FeedbackService } from '@foundation/feedback/state';

type FeedbackWidgetState = 'loading' | 'form' | 'submitted' | 'hidden' | 'dismissed' | 'error';

/** Per-block draft state held in the widget. */
interface BlockDraft {
	/** MCQ: ids of selected options */
	selectedIds: string[];
	/** text: single-line input value */
	textValue: string;
	/** textarea: Quill HTML output */
	htmlValue: string;
	/** rating / NPS: numeric score */
	numericValue: number | null;
	/** file: selected file names */
	fileNames: string[];
	/** screenshot: data URL */
	imageDataUrl: string;
}

function emptyDraft(): BlockDraft {
	return { selectedIds: [], textValue: '', htmlValue: '', numericValue: null, fileNames: [], imageDataUrl: '' };
}

@Component({
	selector: 'lib-feedback-widget',
	standalone: true,
	imports: [FormsModule, TranslateDirective, TranslatePipe, QuillTextareaComponent],
	host: {
		'[style.display]': "(state() === 'hidden' || state() === 'dismissed') ? 'none' : ''",
	},
	template: `
		<div class="feedback-widget relative w-full">
			@switch (state()) {
				@case ('loading') {
					<div class="flex items-center justify-center p-8">
						<span class="loading loading-spinner loading-md"></span>
					</div>
				}
				@case ('error') {
					<div role="alert" class="alert alert-error">
						<span [translate]>Failed to load feedback. Please try again later.</span>
					</div>
				}
				@case ('hidden') {}
				@case ('dismissed') {}
				@case ('submitted') {
					<div class="flex flex-col items-center gap-4 py-6 text-center">
						@if (feedbackConfig().hideable !== false && !feedbackConfig().repeat) {
							<button
								type="button"
								class="btn btn-ghost btn-sm btn-circle absolute top-0 right-0"
								(click)="hide()"
								aria-label="Hide"
							>✕</button>
						}
						<div class="text-4xl">🎉</div>
						@if (feedbackConfig().repeat) {
							<p class="text-base-content/80 text-lg font-medium" [translate]>Your support ticket has been created!</p>
							<button type="button" class="btn btn-primary btn-sm" (click)="resetForRepeat()" [translate]>Submit another</button>
						} @else {
							<p class="text-base-content/80 text-lg font-medium" [translate]>Thank you for your feedback!</p>
							@if (feedbackConfig().editable !== false) {
								<button type="button" class="btn btn-ghost btn-xs" (click)="edit()" [translate]>Edit my answer</button>
							}
						}
					</div>
				}
				@case ('form') {
					<div class="flex flex-col gap-8">
						@if (feedbackConfig().dismissable) {
							<button
								type="button"
								class="btn btn-ghost btn-sm btn-circle absolute top-0 right-0"
								(click)="dismiss()"
								aria-label="Dismiss"
							>✕</button>
						}
						@if (feedbackConfig().title) {
							<h2 class="text-base-content text-xl font-bold">{{ feedbackConfig().title }}</h2>
						}
						@if (feedbackConfig().description) {
							<p class="text-base-content/60 text-sm">{{ feedbackConfig().description }}</p>
						}

						@for (block of feedbackConfig().blocks; track $index; let i = $index) {
							<div class="flex flex-col gap-3">
								<div class="space-y-1">
									<h3 class="text-base-content font-semibold">{{ block.question }}</h3>
									@if (block.description) {
										<p class="text-base-content/60 text-sm">{{ block.description }}</p>
									}
								</div>

								@switch (block.kind) {
									@case ('mcq') {
										<div class="flex flex-col gap-2">
											@for (option of asMCQ(block).options; track option.id) {
												<button
													class="btn h-auto justify-start gap-4 px-5 py-3 text-left"
													[class.btn-primary]="isDraftOptionSelected(i, option.id)"
													[class.btn-outline]="!isDraftOptionSelected(i, option.id)"
													(click)="toggleOption(i, option.id, asMCQ(block).allowMultiple ?? false)"
													[attr.aria-pressed]="isDraftOptionSelected(i, option.id)"
												>
													@if (asMCQ(block).allowMultiple) {
														<input
															type="checkbox"
															class="checkbox checkbox-primary"
															[checked]="isDraftOptionSelected(i, option.id)"
															tabindex="-1"
															(click)="$event.stopPropagation()"
														/>
													} @else {
														<input
															type="radio"
															class="radio radio-primary"
															[checked]="isDraftOptionSelected(i, option.id)"
															tabindex="-1"
															(click)="$event.stopPropagation()"
														/>
													}
													<span>{{ option.label }}</span>
												</button>
											}
										</div>
									}
									@case ('text') {
										<input
											type="text"
											class="input input-bordered w-full"
											[placeholder]="asText(block).placeholder ?? ('Share your thoughts…' | translate)"
											[ngModel]="drafts()[i].textValue"
											(ngModelChange)="updateDraftText(i, $event)"
										/>
									}
									@case ('textarea') {
										<lib-quill-textarea
											[html]="drafts()[i].htmlValue"
											(htmlChange)="updateDraftHtml(i, $event)"
										/>
									}
									@case ('rating') {
										<div class="flex flex-col gap-2">
											<div class="flex gap-2">
												@for (star of ratingRange(asRating(block)); track star) {
													<button
														type="button"
														class="btn btn-circle btn-sm text-lg"
														[class.btn-warning]="(drafts()[i].numericValue ?? 0) >= star"
														[class.btn-ghost]="(drafts()[i].numericValue ?? 0) < star"
														(click)="updateDraftNumeric(i, star, 'rating')"
														[attr.aria-label]="star"
													>
														⭐
													</button>
												}
											</div>
											@if (asRating(block).labels) {
												<div class="text-base-content/50 flex justify-between text-xs">
													<span>{{ asRating(block).labels?.min }}</span>
													<span>{{ asRating(block).labels?.max }}</span>
												</div>
											}
										</div>
									}
									@case ('nps') {
										<div class="flex flex-col gap-2">
											<div class="flex flex-wrap gap-1">
												@for (score of npsRange; track score) {
													<button
														type="button"
														class="btn btn-sm min-w-10"
														[class.btn-primary]="drafts()[i].numericValue === score"
														[class.btn-outline]="drafts()[i].numericValue !== score"
														(click)="updateDraftNumeric(i, score, 'nps')"
													>
														{{ score }}
													</button>
												}
											</div>
											@if (asNPS(block).labels) {
												<div class="text-base-content/50 flex justify-between text-xs">
													<span>{{ asNPS(block).labels?.low }}</span>
													<span>{{ asNPS(block).labels?.high }}</span>
												</div>
											}
										</div>
									}
									@case ('file') {
										<div class="flex flex-col gap-2">
											<input
												type="file"
												class="file-input file-input-bordered w-full"
												[accept]="asFile(block).accept ?? ''"
												[multiple]="asFile(block).multiple ?? false"
												(change)="onFileChange(i, $event)"
											/>
											@if (drafts()[i].fileNames.length > 0) {
												<ul class="text-base-content/60 list-inside list-disc text-sm">
													@for (name of drafts()[i].fileNames; track name) {
														<li>{{ name }}</li>
													}
												</ul>
											}
										</div>
									}
									@case ('screenshot') {
										<div class="flex flex-col gap-2">
											@if (drafts()[i].imageDataUrl) {
												<img
													[src]="drafts()[i].imageDataUrl"
													alt="Screenshot preview"
													class="max-h-48 rounded-lg object-contain"
												/>
											}
											<button
												type="button"
												class="btn btn-outline btn-sm self-start"
												(click)="captureScreenshot(i)"
											>
												📸 <span [translate]>Capture screenshot</span>
											</button>
											<p class="text-base-content/40 text-xs" [translate]>
												Screenshot capture requires browser support for the Screen Capture API.
											</p>
										</div>
									}
									@case ('support-ticket') {
										<input
											type="text"
											class="input input-bordered w-full"
											[placeholder]="asSupportTicket(block).placeholder ?? ('Describe your issue…' | translate)"
											[ngModel]="drafts()[i].textValue"
											(ngModelChange)="updateDraftText(i, $event)"
										/>
									}
								}
							</div>
						}

						<div class="flex justify-end">
							<button
								class="btn btn-primary"
								[disabled]="!canSubmit() || isSubmitting()"
								(click)="submit()"
							>
								@if (isSubmitting()) {
									<span class="loading loading-spinner loading-xs"></span>
								}
								<span [translate]>Submit</span>
							</button>
						</div>
					</div>
				}
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackWidgetComponent {
	/** Unique slug identifying this feedback widget (e.g. "homepage-satisfaction") */
	readonly slug = input.required<string>();

	/** Composable feedback config: title, description, and one or more blocks */
	readonly feedbackConfig = input.required<FeedbackConfig>();

	private _feedbackService = inject(FeedbackService);

	readonly state = signal<FeedbackWidgetState>('loading');
	readonly isSubmitting = signal(false);

	/** Per-block draft state, indexed by block position */
	readonly drafts = signal<BlockDraft[]>([]);

	readonly npsRange = Array.from({ length: 11 }, (_, i) => i);

	readonly canSubmit = computed(() => {
		const blocks = this.feedbackConfig().blocks;
		const draftList = this.drafts();
		if (draftList.length !== blocks.length) return false;
		return blocks.every((block, i) => this._isBlockAnswered(block, draftList[i]));
	});

	constructor() {
		effect(() => {
			const blocks = this.feedbackConfig().blocks;
			if (blocks.length > 0) {
				this.drafts.set(blocks.map(() => emptyDraft()));
			}
		});

		effect(() => {
			const slug = this.slug();
			if (slug) {
				this._feedbackService.getOrCreateInteraction$(slug).subscribe({
					next: (interaction) => {
						if (this._feedbackService.isDismissedFromInteraction(interaction)) {
							this.state.set('dismissed');
						} else if (this._feedbackService.isHiddenFromInteraction(interaction)) {
							this.state.set('hidden');
						} else {
							const saved = this._feedbackService.getAnswersFromInteraction(interaction);
							const blocks = this.feedbackConfig().blocks;
							this.drafts.set(blocks.map((_, i) => saved[i] ? this._draftFromResponse(saved[i]) : emptyDraft()));
							if (this._feedbackService.isSubmittedFromInteraction(interaction)) {
								this.state.set('submitted');
							} else {
								this.state.set('form');
							}
						}
					},
					error: () => {
						this.state.set('error');
					},
				});
			}
		});
	}

	// ─── Widget visibility actions ────────────────────────────────────────────

	edit(): void {
		this.state.set('form');
	}

	hide(): void {
		this._feedbackService.saveHiddenState(this.slug());
		this.state.set('hidden');
	}

	dismiss(): void {
		this._feedbackService.saveDismissedState(this.slug());
		this.state.set('dismissed');
	}

	// ─── Type narrowers (used in template for discriminated union) ───────────

	asMCQ(block: FeedbackBlock): MCQFeedbackBlock {
		if (block.kind === 'mcq') return block;
		throw new Error(`Expected mcq block, got ${block.kind}`);
	}
	asText(block: FeedbackBlock): TextFeedbackBlock {
		if (block.kind === 'text') return block;
		throw new Error(`Expected text block, got ${block.kind}`);
	}
	asTextarea(block: FeedbackBlock): TextareaFeedbackBlock {
		if (block.kind === 'textarea') return block;
		throw new Error(`Expected textarea block, got ${block.kind}`);
	}
	asRating(block: FeedbackBlock): RatingFeedbackBlock {
		if (block.kind === 'rating') return block;
		throw new Error(`Expected rating block, got ${block.kind}`);
	}
	asNPS(block: FeedbackBlock): NPSFeedbackBlock {
		if (block.kind === 'nps') return block;
		throw new Error(`Expected nps block, got ${block.kind}`);
	}
	asFile(block: FeedbackBlock): FileFeedbackBlock {
		if (block.kind === 'file') return block;
		throw new Error(`Expected file block, got ${block.kind}`);
	}
	asSupportTicket(block: FeedbackBlock): SupportTicketFeedbackBlock {
		if (block.kind === 'support-ticket') return block;
		throw new Error(`Expected support-ticket block, got ${block.kind}`);
	}

	ratingRange(block: RatingFeedbackBlock): number[] {
		const min = block.min ?? 1;
		const max = block.max ?? 5;
		return Array.from({ length: max - min + 1 }, (_, i) => i + min);
	}

	// ─── Draft mutations ──────────────────────────────────────────────────────

	isDraftOptionSelected(blockIndex: number, optionId: string): boolean {
		return this.drafts()[blockIndex]?.selectedIds.includes(optionId) ?? false;
	}

	toggleOption(blockIndex: number, optionId: string, allowMultiple: boolean): void {
		this.drafts.update((drafts) => {
			const updated = [...drafts];
			const draft = { ...updated[blockIndex] };
			if (allowMultiple) {
				const already = draft.selectedIds.includes(optionId);
				draft.selectedIds = already ? draft.selectedIds.filter((id) => id !== optionId) : [...draft.selectedIds, optionId];
			} else {
				draft.selectedIds = [optionId];
			}
			updated[blockIndex] = draft;
			return updated;
		});
		const selectedIds = this.drafts()[blockIndex].selectedIds;
		this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'mcq', selectedIds });
	}

	updateDraftText(blockIndex: number, value: string): void {
		this.drafts.update((drafts) => {
			const updated = [...drafts];
			updated[blockIndex] = { ...updated[blockIndex], textValue: value };
			return updated;
		});
		const blockKind = this.feedbackConfig().blocks[blockIndex]?.kind;
		if (blockKind === 'support-ticket') {
			this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'support-ticket', title: value });
		} else {
			this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'text', text: value });
		}
	}

	updateDraftHtml(blockIndex: number, html: string): void {
		this.drafts.update((drafts) => {
			const updated = [...drafts];
			updated[blockIndex] = { ...updated[blockIndex], htmlValue: html };
			return updated;
		});
		this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'textarea', html });
	}

	updateDraftNumeric(blockIndex: number, value: number, kind: 'rating' | 'nps'): void {
		this.drafts.update((drafts) => {
			const updated = [...drafts];
			updated[blockIndex] = { ...updated[blockIndex], numericValue: value };
			return updated;
		});
		const blockResponse: FeedbackBlockResponse = kind === 'nps'
			? { kind: 'nps', score: value }
			: { kind: 'rating', value };
		this._feedbackService.saveAnswer(this.slug(), blockIndex, blockResponse);
	}

	onFileChange(blockIndex: number, event: Event): void {
		const input = event.target;
		if (!(input instanceof HTMLInputElement) || !input.files) return;
		const fileNames = Array.from(input.files).map((f) => f.name);
		this.drafts.update((drafts) => {
			const updated = [...drafts];
			updated[blockIndex] = { ...updated[blockIndex], fileNames };
			return updated;
		});
		this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'file', fileNames });
	}

	async captureScreenshot(blockIndex: number): Promise<void> {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
			const video = document.createElement('video');
			video.srcObject = stream;
			// Wait for at least one frame to be ready before drawing to canvas
			await new Promise<void>((resolve) => {
				video.onloadeddata = () => resolve();
				video.play();
			});
			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			canvas.getContext('2d')?.drawImage(video, 0, 0);
			const imageDataUrl = canvas.toDataURL('image/png');
			stream.getTracks().forEach((track) => track.stop());
			this.drafts.update((drafts) => {
				const updated = [...drafts];
				updated[blockIndex] = { ...updated[blockIndex], imageDataUrl };
				return updated;
			});
			this._feedbackService.saveAnswer(this.slug(), blockIndex, { kind: 'screenshot', imageDataUrl });
		} catch {
			// User cancelled or browser not supported — silently ignore
		}
	}

	// ─── Submission ───────────────────────────────────────────────────────────

	submit(): void {
		if (!this.canSubmit() || this.isSubmitting()) return;
		this.isSubmitting.set(true);

		const blocks = this.feedbackConfig().blocks;
		const shouldRepeat = this.feedbackConfig().repeat ?? false;
		const supportTicketIndex = blocks.findIndex((b) => b.kind === 'support-ticket');

		const onSuccess = () => {
			this.isSubmitting.set(false);
			if (shouldRepeat) {
				this._clearAndResetToForm();
				this.state.set('submitted');
			} else {
				this._feedbackService.markSubmitted(this.slug());
				this.state.set('submitted');
			}
		};

		if (supportTicketIndex !== -1) {
			const ticketTitle = this.drafts()[supportTicketIndex].textValue.trim();
			if (!ticketTitle) {
				this.isSubmitting.set(false);
				return;
			}
			this._feedbackService.createSupportTicketFromFeedback$(ticketTitle).subscribe({
				next: onSuccess,
				error: () => {
					this.isSubmitting.set(false);
					this.state.set('error');
				},
			});
		} else {
			onSuccess();
		}
	}

	/** Reset the form after a repeat submission (clears drafts and goes back to form state). */
	resetForRepeat(): void {
		this._clearAndResetToForm();
		this.state.set('form');
	}

	private _clearAndResetToForm(): void {
		const blocks = this.feedbackConfig().blocks;
		this._feedbackService.clearAnswers(this.slug());
		this.drafts.set(blocks.map(() => emptyDraft()));
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	private _draftFromResponse(blockResponse: FeedbackBlockResponse): BlockDraft {
		const draft = emptyDraft();
		switch (blockResponse.kind) {
			case 'mcq': draft.selectedIds = blockResponse.selectedIds; break;
			case 'text': draft.textValue = blockResponse.text; break;
			case 'textarea': draft.htmlValue = blockResponse.html; break;
			case 'rating': draft.numericValue = blockResponse.value; break;
			case 'nps': draft.numericValue = blockResponse.score; break;
			case 'file': draft.fileNames = blockResponse.fileNames; break;
			case 'screenshot': draft.imageDataUrl = blockResponse.imageDataUrl; break;
			case 'support-ticket': draft.textValue = blockResponse.title; break;
		}
		return draft;
	}

	private _isBlockAnswered(block: FeedbackBlock, draft: BlockDraft): boolean {
		switch (block.kind) {
			case 'mcq':
				return draft.selectedIds.length > 0;
			case 'text':
				return draft.textValue.trim().length > 0;
			case 'textarea':
				return draft.htmlValue.trim().length > 0;
			case 'rating':
				return draft.numericValue !== null;
			case 'nps':
				return draft.numericValue !== null;
			case 'file':
				return draft.fileNames.length > 0;
			case 'screenshot':
				return draft.imageDataUrl.length > 0;
			case 'support-ticket':
				return draft.textValue.trim().length > 0;
		}
	}

}
