export const FEEDBACK_INTERACTION_PREFIX = 'feedback';

// ─── Per-kind block configs ──────────────────────────────────────────────────

export type FeedbackKind = 'mcq' | 'text' | 'textarea' | 'file' | 'screenshot' | 'rating' | 'nps' | 'support-ticket';

export interface FeedbackOption {
	id: string;
	label: string;
}

/** Multiple-choice (single or multi-select) */
export interface MCQFeedbackBlock {
	kind: 'mcq';
	question: string;
	description?: string;
	options: FeedbackOption[];
	/** When true, user may select more than one option */
	allowMultiple?: boolean;
}

/** Single-line text input */
export interface TextFeedbackBlock {
	kind: 'text';
	question: string;
	description?: string;
	placeholder?: string;
}

/** Multi-line rich text (Quill editor) */
export interface TextareaFeedbackBlock {
	kind: 'textarea';
	question: string;
	description?: string;
	placeholder?: string;
}

/** File upload */
export interface FileFeedbackBlock {
	kind: 'file';
	question: string;
	description?: string;
	/** Accepted MIME types or extensions, e.g. "image/*,application/pdf" */
	accept?: string;
	multiple?: boolean;
}

/** Screenshot capture */
export interface ScreenshotFeedbackBlock {
	kind: 'screenshot';
	question: string;
	description?: string;
}

/** Numeric star/score rating */
export interface RatingFeedbackBlock {
	kind: 'rating';
	question: string;
	description?: string;
	/** Minimum value, default 1 */
	min?: number;
	/** Maximum value (number of stars/steps), default 5 */
	max?: number;
	labels?: { min?: string; max?: string };
}

/** Net Promoter Score (0–10) */
export interface NPSFeedbackBlock {
	kind: 'nps';
	question: string;
	description?: string;
	labels?: { low?: string; high?: string };
}

/** Support ticket – creates a support ticket on submission */
export interface SupportTicketFeedbackBlock {
	kind: 'support-ticket';
	question: string;
	description?: string;
	placeholder?: string;
}

export type FeedbackBlock =
	| MCQFeedbackBlock
	| TextFeedbackBlock
	| TextareaFeedbackBlock
	| FileFeedbackBlock
	| ScreenshotFeedbackBlock
	| RatingFeedbackBlock
	| NPSFeedbackBlock
	| SupportTicketFeedbackBlock;

/**
 * Composable feedback config.
 * A widget is composed of one or more blocks rendered in sequence.
 * For simple use-cases pass a single-element `blocks` array.
 */
export interface FeedbackConfig {
	title?: string;
	description?: string;
	blocks: FeedbackBlock[];
	/** Allow the user to re-open the form after submitting to change their answer. Default: true */
	editable?: boolean;
	/** Show a close button after submitting to hide the widget. Default: true */
	hideable?: boolean;
	/** Show a close button on the form itself to dismiss without answering. Default: false */
	dismissable?: boolean;
	/**
	 * When true, the form resets after each submission instead of staying in the submitted state.
	 * Useful for blocks like `support-ticket` where the user may submit multiple entries.
	 * Default: false
	 */
	repeat?: boolean;
}

// ─── Per-kind responses ──────────────────────────────────────────────────────

export interface MCQFeedbackResponse {
	kind: 'mcq';
	selectedIds: string[];
}

export interface TextFeedbackResponse {
	kind: 'text';
	text: string;
}

export interface TextareaFeedbackResponse {
	kind: 'textarea';
	/** Quill semantic HTML output */
	html: string;
}

export interface FileFeedbackResponse {
	kind: 'file';
	/** Names of the selected files (actual upload handled externally) */
	fileNames: string[];
}

export interface ScreenshotFeedbackResponse {
	kind: 'screenshot';
	/** Base64-encoded data URL of the captured screenshot */
	imageDataUrl: string;
}

export interface RatingFeedbackResponse {
	kind: 'rating';
	value: number;
}

export interface NPSFeedbackResponse {
	kind: 'nps';
	score: number;
}

export interface SupportTicketFeedbackResponse {
	kind: 'support-ticket';
	/** The ticket title entered by the user */
	title: string;
}

export type FeedbackBlockResponse =
	| MCQFeedbackResponse
	| TextFeedbackResponse
	| TextareaFeedbackResponse
	| FileFeedbackResponse
	| ScreenshotFeedbackResponse
	| RatingFeedbackResponse
	| NPSFeedbackResponse
	| SupportTicketFeedbackResponse;

/**
 * The full feedback response, stored in `interaction.config.response`.
 * Contains one entry per block in the corresponding `FeedbackConfig.blocks` array.
 */
export interface FeedbackResponse {
	blocks: FeedbackBlockResponse[];
	timestamp: number;
}

// ─── Type guards ─────────────────────────────────────────────────────────────

export function isFeedbackResponse(value: unknown): value is FeedbackResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'blocks' in value &&
		Array.isArray((value as Record<string, unknown>)['blocks']) &&
		'timestamp' in value &&
		typeof (value as Record<string, unknown>)['timestamp'] === 'number'
	);
}

export function isMCQFeedbackResponse(value: FeedbackBlockResponse): value is MCQFeedbackResponse {
	return value.kind === 'mcq';
}

export function isTextFeedbackResponse(value: FeedbackBlockResponse): value is TextFeedbackResponse {
	return value.kind === 'text';
}

export function isTextareaFeedbackResponse(value: FeedbackBlockResponse): value is TextareaFeedbackResponse {
	return value.kind === 'textarea';
}

export function isRatingFeedbackResponse(value: FeedbackBlockResponse): value is RatingFeedbackResponse {
	return value.kind === 'rating';
}

export function isNPSFeedbackResponse(value: FeedbackBlockResponse): value is NPSFeedbackResponse {
	return value.kind === 'nps';
}

export function isSupportTicketFeedbackResponse(value: FeedbackBlockResponse): value is SupportTicketFeedbackResponse {
	return value.kind === 'support-ticket';
}
