import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FeedbackConfig } from '@foundation/feedback/models';
import { FeedbackService } from '@foundation/feedback/state';
import { Observable, of, Subject, throwError } from 'rxjs';
import { FeedbackWidgetComponent } from './feedback-widget.component';

describe('FeedbackWidgetComponent', () => {
	const textConfig: FeedbackConfig = {
		title: 'Quick feedback',
		blocks: [{ kind: 'text', question: 'What do you think?' }],
	};
	let interaction$: Subject<unknown>;
	const service = {
		getOrCreateInteraction$: vi.fn(() => interaction$.asObservable()),
		isDismissedFromInteraction: vi.fn(() => false),
		isHiddenFromInteraction: vi.fn(() => false),
		isSubmittedFromInteraction: vi.fn(() => false),
		getAnswersFromInteraction: vi.fn(() => ({})),
		saveAnswer: vi.fn(),
		saveHiddenState: vi.fn(),
		saveDismissedState: vi.fn(),
		markSubmitted: vi.fn(),
		clearAnswers: vi.fn(),
		createSupportTicketFromFeedback$: vi.fn((): Observable<boolean> => of(true)),
	};
	const router = { navigateByUrl: vi.fn() };

	function create(config: FeedbackConfig = textConfig): ComponentFixture<FeedbackWidgetComponent> {
		const fixture = TestBed.createComponent(FeedbackWidgetComponent);
		fixture.componentRef.setInput('slug', 'homepage');
		fixture.componentRef.setInput('feedbackConfig', config);
		fixture.detectChanges();
		return fixture;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		interaction$ = new Subject<unknown>();
		service.getOrCreateInteraction$.mockReturnValue(interaction$.asObservable());
		service.isDismissedFromInteraction.mockReturnValue(false);
		service.isHiddenFromInteraction.mockReturnValue(false);
		service.isSubmittedFromInteraction.mockReturnValue(false);
		service.getAnswersFromInteraction.mockReturnValue({});
		service.createSupportTicketFromFeedback$.mockReturnValue(of(true));
		TestBed.configureTestingModule({
			imports: [FeedbackWidgetComponent],
			providers: [
				{ provide: FeedbackService, useValue: service },
				{ provide: Router, useValue: router },
			],
		});
		TestBed.overrideComponent(FeedbackWidgetComponent, { set: { template: '' } });
	});

	it('hydrates saved answers and submitted state', () => {
		service.getAnswersFromInteraction.mockReturnValue({
			0: { kind: 'mcq', selectedIds: ['a'] },
			1: { kind: 'text', text: 'hello' },
			2: { kind: 'textarea', html: '<p>details</p>' },
			3: { kind: 'rating', value: 4 },
			4: { kind: 'nps', score: 9 },
			5: { kind: 'file', fileNames: ['proof.pdf'] },
			6: { kind: 'screenshot', imageDataUrl: 'data:image/png;base64,x' },
			7: { kind: 'support-ticket', title: 'Help me' },
		});
		service.isSubmittedFromInteraction.mockReturnValue(true);
		const config: FeedbackConfig = { blocks: [
			{ kind: 'mcq', question: 'Pick', options: [{ id: 'a', label: 'A' }] },
			{ kind: 'text', question: 'Text' },
			{ kind: 'textarea', question: 'Details' },
			{ kind: 'rating', question: 'Rating' },
			{ kind: 'nps', question: 'NPS' },
			{ kind: 'file', question: 'File' },
			{ kind: 'screenshot', question: 'Screenshot' },
			{ kind: 'support-ticket', question: 'Support' },
		] };
		const component = create(config).componentInstance;

		interaction$.next({ config: {} });

		expect(component.state()).toBe('submitted');
		expect(component.drafts()).toEqual([
			expect.objectContaining({ selectedIds: ['a'] }),
			expect.objectContaining({ textValue: 'hello' }),
			expect.objectContaining({ htmlValue: '<p>details</p>' }),
			expect.objectContaining({ numericValue: 4 }),
			expect.objectContaining({ numericValue: 9 }),
			expect.objectContaining({ fileNames: ['proof.pdf'] }),
			expect.objectContaining({ imageDataUrl: 'data:image/png;base64,x' }),
			expect.objectContaining({ textValue: 'Help me' }),
		]);
	});

	it.each([
		['dismissed', 'isDismissedFromInteraction'],
		['hidden', 'isHiddenFromInteraction'],
	] as const)('enters %s state from the persisted interaction', (expected, reader) => {
		service[reader].mockReturnValue(true);
		const component = create().componentInstance;
		interaction$.next({ config: {} });
		expect(component.state()).toBe(expected);
	});

	it('enters error state when interaction loading fails', () => {
		service.getOrCreateInteraction$.mockReturnValue(throwError(() => new Error('offline')));
		const component = create().componentInstance;
		expect(component.state()).toBe('error');
	});

	it('persists hide and dismiss actions and can return to editing', () => {
		const component = create().componentInstance;
		component.hide();
		expect(service.saveHiddenState).toHaveBeenCalledWith('homepage');
		expect(component.state()).toBe('hidden');
		component.dismiss();
		expect(service.saveDismissedState).toHaveBeenCalledWith('homepage');
		expect(component.state()).toBe('dismissed');
		component.edit();
		expect(component.state()).toBe('form');
	});

	it('mutates single and multiple MCQ drafts and persists each answer', () => {
		const component = create({ blocks: [{
			kind: 'mcq', question: 'Pick', allowMultiple: true,
			options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
		}] }).componentInstance;

		component.toggleOption(0, 'a', true);
		component.toggleOption(0, 'b', true);
		component.toggleOption(0, 'a', true);
		expect(component.drafts()[0].selectedIds).toEqual(['b']);
		expect(component.isDraftOptionSelected(0, 'b')).toBe(true);
		component.toggleOption(0, 'a', false);
		expect(component.drafts()[0].selectedIds).toEqual(['a']);
		expect(service.saveAnswer).toHaveBeenLastCalledWith('homepage', 0, { kind: 'mcq', selectedIds: ['a'] });
	});

	it('updates text, rich text, rating and NPS drafts and enables submission', () => {
		const component = create({ blocks: [
			{ kind: 'text', question: 'Text' },
			{ kind: 'textarea', question: 'Details' },
			{ kind: 'rating', question: 'Rating' },
			{ kind: 'nps', question: 'NPS' },
			{ kind: 'support-ticket', question: 'Support' },
		] }).componentInstance;
		expect(component.canSubmit()).toBe(false);

		component.updateDraftText(0, 'hello');
		component.updateDraftHtml(1, '<p>world</p>');
		component.updateDraftNumeric(2, 5, 'rating');
		component.updateDraftNumeric(3, 10, 'nps');
		component.updateDraftText(4, 'Need help');

		expect(component.canSubmit()).toBe(true);
		expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 0, { kind: 'text', text: 'hello' });
		expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 1, { kind: 'textarea', html: '<p>world</p>' });
		expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 2, { kind: 'rating', value: 5 });
		expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 3, { kind: 'nps', score: 10 });
		expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 4, { kind: 'support-ticket', title: 'Need help' });
	});

	it('marks a normal response submitted and ignores duplicate submissions', () => {
		const component = create().componentInstance;
		component.updateDraftText(0, 'Useful');
		component.submit();

		expect(service.markSubmitted).toHaveBeenCalledWith('homepage');
		expect(component.state()).toBe('submitted');
		expect(component.isSubmitting()).toBe(false);
		component.isSubmitting.set(true);
		component.submit();
		expect(service.markSubmitted).toHaveBeenCalledTimes(1);
	});

	it('clears repeat answers after submission and resets the form on request', () => {
		const component = create({ ...textConfig, repeat: true }).componentInstance;
		component.updateDraftText(0, 'First answer');
		component.submit();

		expect(service.clearAnswers).toHaveBeenCalledWith('homepage');
		expect(service.markSubmitted).not.toHaveBeenCalled();
		expect(component.drafts()[0].textValue).toBe('');
		expect(component.state()).toBe('submitted');
		component.resetForRepeat();
		expect(component.state()).toBe('form');
		expect(service.clearAnswers).toHaveBeenCalledTimes(2);
	});

	it('creates a trimmed support ticket and handles service failure', () => {
		const component = create({ blocks: [{ kind: 'support-ticket', question: 'Issue' }] }).componentInstance;
		component.updateDraftText(0, '  Cannot log in  ');
		component.submit();
		expect(service.createSupportTicketFromFeedback$).toHaveBeenCalledWith('Cannot log in');
		expect(component.state()).toBe('submitted');

		service.createSupportTicketFromFeedback$.mockReturnValue(throwError(() => new Error('offline')));
		component.edit();
		component.submit();
		expect(component.state()).toBe('error');
		expect(component.isSubmitting()).toBe(false);
	});

	it('provides rating ranges and rejects incorrect type narrowing', () => {
		const component = create().componentInstance;
		expect(component.ratingRange({ kind: 'rating', question: 'Rate', min: 2, max: 4 })).toEqual([2, 3, 4]);
		expect(() => component.asMCQ({ kind: 'text', question: 'Wrong' })).toThrow('Expected mcq block, got text');
	});

	// An announcement card: asks nothing, and what it measures is whether anyone clicked.
	describe('cta blocks', () => {
		const ctaConfig: FeedbackConfig = {
			title: 'Coming from Rumble Studio?',
			blocks: [
				{
					kind: 'cta',
					question: 'Rumble Studio closes on August 31.',
					links: [
						{ id: 'guide', label: 'Read the guide', url: 'https://example.test/guide', external: true },
						{ id: 'tool', label: 'Open the tool', url: '/host/rumblestudio' },
					],
				},
			],
		};

		it('records the click, which is what makes the rate readable later', () => {
			const fixture = create(ctaConfig);
			const block = ctaConfig.blocks[0] as { links: { id: string; label: string; url: string; external?: boolean }[] };

			fixture.componentInstance.followCtaLink(0, block.links[1]);

			expect(service.saveAnswer).toHaveBeenCalledWith('homepage', 0, { kind: 'cta', clickedIds: ['tool'] });
		});

		it('routes in-app for an internal link', () => {
			const fixture = create(ctaConfig);
			const block = ctaConfig.blocks[0] as { links: { id: string; label: string; url: string; external?: boolean }[] };

			fixture.componentInstance.followCtaLink(0, block.links[1]);

			expect(router.navigateByUrl).toHaveBeenCalledWith('/host/rumblestudio');
		});

		// The dashboard has to survive the click, or they cannot come back and act on it.
		it('opens an external link in a new tab, leaving the dashboard alone', () => {
			const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
			const fixture = create(ctaConfig);
            const block = ctaConfig.blocks[0] as { links: { id: string; label: string; url: string; external?: boolean }[] };

			fixture.componentInstance.followCtaLink(0, block.links[0]);

			expect(openSpy).toHaveBeenCalledWith('https://example.test/guide', '_blank', 'noopener');
			expect(router.navigateByUrl).not.toHaveBeenCalled();
			openSpy.mockRestore();
		});

		it('counts a link once however often it is clicked', () => {
			const fixture = create(ctaConfig);
			const block = ctaConfig.blocks[0] as { links: { id: string; label: string; url: string; external?: boolean }[] };

			fixture.componentInstance.followCtaLink(0, block.links[1]);
			fixture.componentInstance.followCtaLink(0, block.links[1]);

			expect(service.saveAnswer).toHaveBeenLastCalledWith('homepage', 0, { kind: 'cta', clickedIds: ['tool'] });
		});

		it('has nothing to submit', () => {
			const fixture = create(ctaConfig);

			expect(fixture.componentInstance.isAnnouncementOnly()).toBe(true);
		});
	});
});
