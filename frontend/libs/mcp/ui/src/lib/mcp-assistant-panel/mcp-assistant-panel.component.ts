import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, inject, input, model, OnInit, Output, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TwAddIcon, TwClipboardDocumentIcon, TwMicIcon } from '@foundation/icons';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { MarkdownToHtmlDirective } from '@foundation/utils';
import { finalize } from 'rxjs';

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface BrowserSpeechRecognition {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
	onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
}

interface BrowserSpeechRecognitionAlternative {
	transcript: string;
}

interface BrowserSpeechRecognitionResult {
	isFinal: boolean;
	[index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
	resultIndex: number;
	results: BrowserSpeechRecognitionResult[];
}

interface BrowserSpeechRecognitionErrorEvent {
	error: string;
}

interface BrowserSpeechRecognitionWindow extends Window {
	SpeechRecognition?: BrowserSpeechRecognitionConstructor;
	webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
}

interface McpAvailabilityResult extends Record<string, unknown> {
	available: boolean;
	reason?: string | null;
}

interface McpToolRun {
	tool_name: string;
	status: string;
	args: Record<string, unknown>;
	result: unknown;
}

interface McpAskResult extends Record<string, unknown> {
	query: string;
	answer?: string;
	tool_runs: McpToolRun[];
	model_final_message?: string;
}

@Component({
	selector: 'lib-mcp-assistant-panel',
	imports: [CommonModule, FormsModule, TwAddIcon, TwMicIcon, TwClipboardDocumentIcon, MarkdownToHtmlDirective],
	templateUrl: './mcp-assistant-panel.component.html',
	styleUrl: './mcp-assistant-panel.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpAssistantPanelComponent implements OnInit {
	@ViewChild('promptInput') promptInput?: ElementRef<HTMLTextAreaElement>;
	@Output() iconAction = new EventEmitter<void>();
	@Output() promptSubmitted = new EventEmitter<string>();

	eyebrow = input('Assistant');
	title = input('Quel sujet souhaitez-vous aborder ?');
	placeholder = input('Poser une question ou lancer une recherche');
	submitLabel = input('Explorer');
	iconActionLabel = input('Open resources');
	iconActionTitle = input('Importer ou parcourir vos fichiers');
	reportTitlePrefix = input('Rapport MCP pour');
	mcpBasePath = input('/api/mcp');
	submitAction = input<'mcp-search' | 'external'>('mcp-search');

	private _notificationService = inject(NotificationService);
	private _translationService = inject(TranslationService);
	private _requestService = inject(RequestService);
	private _clipboard = inject(Clipboard);
	private _speechRecognition: BrowserSpeechRecognition | null = null;
	private _speechRecognitionBaseText = '';

	promptText = model('');
	available = signal(false);
	availabilityChecked = signal(false);
	isListening = false;
	speechRecognitionSupported = false;
	isSearching = signal(false);
	toolRuns = signal<McpToolRun[]>([]);
	reportQuery = signal('');
	answer = signal('');
	modelFinalMessage = signal('');
	activeTab = signal<'response' | 'details'>('response');

	private _i18nSearchError = this._translationService.prep('Request failed. Please try again.');

	constructor() {
		this._initializeSpeechRecognition();
	}

	ngOnInit(): void {
		this._checkAvailability();
	}

	hasReport(): boolean {
		return !!this.answer() || !!this.modelFinalMessage() || !!this.toolRuns().length;
	}

	stringify(value: unknown): string {
		return JSON.stringify(value, null, 2);
	}

	copyToClipboard(text: string): void {
		this._clipboard.copy(text);
	}

	clearReport(): void {
		this.toolRuns.set([]);
		this.reportQuery.set('');
		this.answer.set('');
		this.modelFinalMessage.set('');
	}

	runSearch(): void {
		const query = this.promptText().trim();
		if (!query) return;

		if (this.submitAction() === 'external') {
			this.promptSubmitted.emit(query);
			return;
		}

		this.isSearching.set(true);
		this.clearReport();
		this.activeTab.set('response');

		this._requestService
			.post$<McpAskResult>(`${this.mcpBasePath()}/ask?query=${encodeURIComponent(query)}`, {})
			.pipe(finalize(() => this.isSearching.set(false)))
			.subscribe({
				next: (response) => {
					this.toolRuns.set(response.result?.tool_runs ?? []);
					this.reportQuery.set(response.result?.query || query);
					this.answer.set(response.result?.answer || '');
					this.modelFinalMessage.set(response.result?.model_final_message || '');
					if (response.error) {
						this._notificationService.snackWarning(this._i18nSearchError());
					}
				},
				error: () => {
					this._notificationService.snackWarning(this._i18nSearchError());
				},
			});
	}

	autoResizePrompt(textarea: HTMLTextAreaElement): void {
		textarea.style.height = '0px';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
	}

	handlePromptKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			this.runSearch();
		}
	}

	toggleVoiceInput(): void {
		if (!this._speechRecognition) {
			this._notificationService.notify("La dictée vocale n'est pas disponible dans ce navigateur.", 'Microphone indisponible');
			return;
		}

		if (this.isListening) {
			this.isListening = false;
			this._speechRecognition.stop();
			return;
		}

		this._speechRecognitionBaseText = this.promptText().trimEnd();

		try {
			this._speechRecognition.start();
			this.isListening = true;
		} catch {
			this._notificationService.notify('Impossible de démarrer la dictée vocale pour le moment.', 'Microphone indisponible');
			this.isListening = false;
		}
	}

	private _checkAvailability(): void {
		this._requestService.getBasic$<McpAvailabilityResult>(`${this.mcpBasePath()}/available`, undefined, { silentError: true }).subscribe({
			next: (response) => {
				this.available.set(!!response.result?.available);
				this.availabilityChecked.set(true);
			},
			error: () => {
				this.available.set(false);
				this.availabilityChecked.set(true);
			},
		});
	}

	private _initializeSpeechRecognition(): void {
		if (typeof window === 'undefined') return;

		const browserWindow = window as BrowserSpeechRecognitionWindow;
		const SpeechRecognitionCtor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) return;

		this.speechRecognitionSupported = true;
		this._speechRecognition = new SpeechRecognitionCtor();
		this._speechRecognition.continuous = true;
		this._speechRecognition.interimResults = true;
		this._speechRecognition.lang = 'fr-FR';

		this._speechRecognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
			let interimTranscript = '';
			let finalTranscript = '';

			for (let index = event.resultIndex; index < event.results.length; index++) {
				const transcript = event.results[index][0]?.transcript ?? '';
				if (event.results[index].isFinal) {
					finalTranscript += transcript;
				} else {
					interimTranscript += transcript;
				}
			}

			const base = this._speechRecognitionBaseText;
			const separator = base && (finalTranscript || interimTranscript) ? ' ' : '';
			this.promptText.set(`${base}${separator}${finalTranscript}${interimTranscript}`.trimStart());
			if (this.promptInput?.nativeElement) {
				this.autoResizePrompt(this.promptInput.nativeElement);
			}
		};

		this._speechRecognition.onerror = () => {
			this.isListening = false;
		};

		this._speechRecognition.onend = () => {
			this.isListening = false;
		};
	}
}
