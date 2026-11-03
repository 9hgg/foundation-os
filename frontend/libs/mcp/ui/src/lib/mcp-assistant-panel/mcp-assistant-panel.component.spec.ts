import { Clipboard } from '@angular/cdk/clipboard';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { of, throwError } from 'rxjs';
import { McpAssistantPanelComponent } from './mcp-assistant-panel.component';

class FakeSpeechRecognition {
	continuous = false;
	interimResults = false;
	lang = '';
	onresult: ((event: any) => void) | null = null;
	onerror: ((event: any) => void) | null = null;
	onend: (() => void) | null = null;
	start = vi.fn();
	stop = vi.fn();
}

describe('McpAssistantPanelComponent', () => {
	const clipboard = { copy: vi.fn() };
	const notificationService = { notify: vi.fn(), snackWarning: vi.fn() };
	const requestService = { getBasic$: vi.fn(), post$: vi.fn() };
	const translationService = { prep: () => () => 'translated' };

	beforeEach(() => {
		vi.clearAllMocks();
		delete (window as any).SpeechRecognition;
		delete (window as any).webkitSpeechRecognition;
		requestService.getBasic$.mockReturnValue(of({ result: { available: true } }));
		TestBed.configureTestingModule({
			providers: [
				{ provide: Clipboard, useValue: clipboard },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: RequestService, useValue: requestService },
				{ provide: TranslationService, useValue: translationService },
			],
		});
	});

	function build() {
		return TestBed.runInInjectionContext(() => new McpAssistantPanelComponent());
	}

	describe('availability check', () => {
		it('marks itself available once the endpoint answers', () => {
			const component = build();
			component.ngOnInit();
			expect(component.available()).toBe(true);
			expect(component.availabilityChecked()).toBe(true);
			expect(requestService.getBasic$).toHaveBeenCalledWith('/api/mcp/available', undefined, { silentError: true });
		});

		it('marks itself unavailable when the endpoint says so', () => {
			requestService.getBasic$.mockReturnValue(of({ result: { available: false } }));
			const component = build();
			component.ngOnInit();
			expect(component.available()).toBe(false);
			expect(component.availabilityChecked()).toBe(true);
		});

		it('marks itself unavailable when the availability check errors out', () => {
			requestService.getBasic$.mockReturnValue(throwError(() => new Error('down')));
			const component = build();
			component.ngOnInit();
			expect(component.available()).toBe(false);
			expect(component.availabilityChecked()).toBe(true);
		});

		it('respects a custom mcpBasePath', () => {
			const component = build();
			component.mcpBasePath = () => '/api/custom-mcp';
			component.ngOnInit();
			expect(requestService.getBasic$).toHaveBeenCalledWith('/api/custom-mcp/available', undefined, { silentError: true });
		});
	});

	describe('hasReport', () => {
		it('is false with no answer, no final message and no tool runs', () => {
			const component = build();
			expect(component.hasReport()).toBe(false);
		});

		it('is true once there is an answer', () => {
			const component = build();
			component.answer.set('some answer');
			expect(component.hasReport()).toBe(true);
		});

		it('is true once there is a final model message', () => {
			const component = build();
			component.modelFinalMessage.set('final');
			expect(component.hasReport()).toBe(true);
		});

		it('is true once there are tool runs', () => {
			const component = build();
			component.toolRuns.set([{ tool_name: 't', status: 'ok', args: {}, result: {} }]);
			expect(component.hasReport()).toBe(true);
		});
	});

	it('stringify pretty-prints with two-space indentation', () => {
		const component = build();
		expect(component.stringify({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
	});

	it('copyToClipboard delegates to the Clipboard service', () => {
		const component = build();
		component.copyToClipboard('hello');
		expect(clipboard.copy).toHaveBeenCalledWith('hello');
	});

	it('clearReport resets every report signal', () => {
		const component = build();
		component.toolRuns.set([{ tool_name: 't', status: 'ok', args: {}, result: {} }]);
		component.reportQuery.set('q');
		component.answer.set('a');
		component.modelFinalMessage.set('m');

		component.clearReport();

		expect(component.toolRuns()).toEqual([]);
		expect(component.reportQuery()).toBe('');
		expect(component.answer()).toBe('');
		expect(component.modelFinalMessage()).toBe('');
	});

	describe('runSearch', () => {
		it('does nothing for a blank prompt', () => {
			const component = build();
			component.promptText.set('   ');
			component.runSearch();
			expect(requestService.post$).not.toHaveBeenCalled();
		});

		it('emits promptSubmitted instead of calling the backend when submitAction is external', () => {
			const component = build();
			component.submitAction = () => 'external';
			component.promptText.set('a question');
			const emitted: string[] = [];
			component.promptSubmitted.subscribe((q) => emitted.push(q));

			component.runSearch();

			expect(emitted).toEqual(['a question']);
			expect(requestService.post$).not.toHaveBeenCalled();
		});

		it('runs the mcp search, fills the report and stops the loading flag', () => {
			requestService.post$.mockReturnValue(
				of({
					result: {
						query: 'a question',
						answer: 'the answer',
						tool_runs: [{ tool_name: 't', status: 'ok', args: {}, result: {} }],
						model_final_message: 'final',
					},
				})
			);
			const component = build();
			component.promptText.set('a question');

			component.runSearch();

			expect(requestService.post$).toHaveBeenCalledWith('/api/mcp/ask?query=a%20question', {});
			expect(component.isSearching()).toBe(false);
			expect(component.answer()).toBe('the answer');
			expect(component.modelFinalMessage()).toBe('final');
			expect(component.reportQuery()).toBe('a question');
			expect(component.toolRuns()).toEqual([{ tool_name: 't', status: 'ok', args: {}, result: {} }]);
			expect(component.activeTab()).toBe('response');
			expect(notificationService.snackWarning).not.toHaveBeenCalled();
		});

		it('falls back to the raw query and warns when the response carries an error', () => {
			requestService.post$.mockReturnValue(of({ result: undefined, error: { title: 'nope' } }));
			const component = build();
			component.promptText.set('a question');

			component.runSearch();

			expect(component.reportQuery()).toBe('a question');
			expect(component.toolRuns()).toEqual([]);
			expect(notificationService.snackWarning).toHaveBeenCalledWith('translated');
		});

		it('warns and stops loading when the request itself errors', () => {
			requestService.post$.mockReturnValue(throwError(() => new Error('boom')));
			const component = build();
			component.promptText.set('a question');

			component.runSearch();

			expect(component.isSearching()).toBe(false);
			expect(notificationService.snackWarning).toHaveBeenCalledWith('translated');
		});
	});

	describe('autoResizePrompt', () => {
		it('grows the textarea to fit its scroll height', () => {
			const component = build();
			const textarea = document.createElement('textarea');
			Object.defineProperty(textarea, 'scrollHeight', { value: 80, configurable: true });

			component.autoResizePrompt(textarea);

			expect(textarea.style.height).toBe('80px');
		});

		it('caps the height at 160px', () => {
			const component = build();
			const textarea = document.createElement('textarea');
			Object.defineProperty(textarea, 'scrollHeight', { value: 400, configurable: true });

			component.autoResizePrompt(textarea);

			expect(textarea.style.height).toBe('160px');
		});
	});

	describe('handlePromptKeydown', () => {
		it('submits on Enter without shift and prevents the default newline', () => {
			const component = build();
			component.promptText.set('a question');
			const runSpy = vi.spyOn(component, 'runSearch');
			const event = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;

			component.handlePromptKeydown(event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(runSpy).toHaveBeenCalled();
		});

		it('does not submit on shift+Enter', () => {
			const component = build();
			const runSpy = vi.spyOn(component, 'runSearch');
			const event = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent;

			component.handlePromptKeydown(event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(runSpy).not.toHaveBeenCalled();
		});

		it('ignores other keys', () => {
			const component = build();
			const runSpy = vi.spyOn(component, 'runSearch');
			const event = { key: 'a', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;

			component.handlePromptKeydown(event);

			expect(runSpy).not.toHaveBeenCalled();
		});
	});

	describe('voice input', () => {
		it('notifies unavailability when the browser has no speech recognition support', () => {
			const component = build();
			expect(component.speechRecognitionSupported).toBe(false);

			component.toggleVoiceInput();

			expect(notificationService.notify).toHaveBeenCalledWith("La dictée vocale n'est pas disponible dans ce navigateur.", 'Microphone indisponible');
		});

		it('starts listening, seeding the base text from the current prompt', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();
			component.promptText.set('existing text');

			component.toggleVoiceInput();

			expect(component.isListening).toBe(true);
			expect((component as any)._speechRecognition.start).toHaveBeenCalled();
		});

		it('stops listening on a second call', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();

			component.toggleVoiceInput();
			component.toggleVoiceInput();

			expect(component.isListening).toBe(false);
			expect((component as any)._speechRecognition.stop).toHaveBeenCalled();
		});

		it('falls back to webkitSpeechRecognition when the standard constructor is absent', () => {
			(window as any).webkitSpeechRecognition = FakeSpeechRecognition;
			const component = build();
			expect(component.speechRecognitionSupported).toBe(true);
		});

		it('recovers and notifies when starting the recognizer throws', () => {
			class ThrowingSpeechRecognition extends FakeSpeechRecognition {
				override start = vi.fn(() => {
					throw new Error('mic denied');
				});
			}
			(window as any).SpeechRecognition = ThrowingSpeechRecognition;
			const component = build();

			component.toggleVoiceInput();

			expect(component.isListening).toBe(false);
			expect(notificationService.notify).toHaveBeenCalledWith('Impossible de démarrer la dictée vocale pour le moment.', 'Microphone indisponible');
		});

		it('builds the prompt text from interim and final transcripts as results arrive', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();
			component.promptText.set('base');
			component.toggleVoiceInput();

			const recognition = (component as any)._speechRecognition as FakeSpeechRecognition;
			recognition.onresult?.({
				resultIndex: 0,
				results: [
					Object.assign([{ transcript: 'hello ' }], { isFinal: true }),
					Object.assign([{ transcript: 'world' }], { isFinal: false }),
				],
			});

			expect(component.promptText()).toBe('base hello world');
		});

		it('resizes the prompt textarea as speech results come in when it is attached', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();
			const textarea = document.createElement('textarea');
			Object.defineProperty(textarea, 'scrollHeight', { value: 40, configurable: true });
			component.promptInput = new ElementRef(textarea);
			component.toggleVoiceInput();

			const recognition = (component as any)._speechRecognition as FakeSpeechRecognition;
			recognition.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'hi' }], { isFinal: true })] });

			expect(textarea.style.height).toBe('40px');
		});

		it('stops listening on a recognition error', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();
			component.toggleVoiceInput();

			const recognition = (component as any)._speechRecognition as FakeSpeechRecognition;
			recognition.onerror?.({ error: 'network' });

			expect(component.isListening).toBe(false);
		});

		it('stops listening when recognition ends on its own', () => {
			(window as any).SpeechRecognition = FakeSpeechRecognition;
			const component = build();
			component.toggleVoiceInput();

			const recognition = (component as any)._speechRecognition as FakeSpeechRecognition;
			recognition.onend?.();

			expect(component.isListening).toBe(false);
		});
	});
});
