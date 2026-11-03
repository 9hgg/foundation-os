import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { NotificationService } from '@foundation/notification';
import { of, Subject } from 'rxjs';
import { SubtitleLoaderComponent, subtitleCuesAsProse } from './subtitle-loader.component';

const srtFile: EntityFile = {
	id: 'file-1',
	inStorage: true,
	extra: {
		alternativeFormats: [{ storageSuffix: 'whisper_transcript_srt', mime: 'text/plain' }],
	},
	config: {},
};

describe('subtitleCuesAsProse', () => {
	it('keeps the words and drops the scaffolding', () => {
		const srt = ['1', '00:00:00,000 --> 00:00:02,400', 'Hello there.', '', '2', '00:00:02,400 --> 00:00:05,000', 'This is the second cue.', ''].join('\n');

		expect(subtitleCuesAsProse(srt)).toBe('Hello there. This is the second cue.');
	});

	it('has nothing to say about an empty transcript', () => {
		expect(subtitleCuesAsProse('')).toBe('');
	});

	it('keeps a line of digits that is part of the speech', () => {
		// A cue number is alone on its line; "1999" inside a sentence is not.
		expect(subtitleCuesAsProse('1\n00:00:01,000 --> 00:00:02,000\nIt was 1999.')).toBe('It was 1999.');
	});
});

describe('SubtitleLoaderComponent', () => {
	let getObjectById$$$: ReturnType<typeof vi.fn>;
	let fetchTextContent: ReturnType<typeof vi.fn>;
	let notificationService: { snack: ReturnType<typeof vi.fn> };

	const build = () => {
		TestBed.configureTestingModule({
			imports: [SubtitleLoaderComponent],
			providers: [
				{ provide: FilesRepository, useValue: { store: { getObjectById$$$ }, fetchTextContent } },
				{ provide: NotificationService, useValue: notificationService },
			],
		});
		return TestBed.createComponent(SubtitleLoaderComponent);
	};

	beforeEach(() => {
		getObjectById$$$ = vi.fn().mockReturnValue({ $: of(null) });
		fetchTextContent = vi.fn();
		notificationService = { snack: vi.fn() };
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('text', () => {
		it('shows the subtitle as-is by default (cues)', () => {
			const fixture = build();
			fixture.componentRef.setInput('subtitle', 'raw srt content');
			fixture.detectChanges();
			expect(fixture.componentInstance.text()).toBe('raw srt content');
		});

		it('strips cue scaffolding when display is prose', () => {
			const srt = ['1', '00:00:00,000 --> 00:00:02,400', 'Hello there.'].join('\n');
			const fixture = build();
			fixture.componentRef.setInput('subtitle', srt);
			fixture.componentRef.setInput('display', 'prose');
			fixture.detectChanges();
			expect(fixture.componentInstance.text()).toBe('Hello there.');
		});
	});

	describe('loading the transcript', () => {
		it('does not fetch without an entityFileId', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(getObjectById$$$).not.toHaveBeenCalled();
		});

		it('fetches the matching alternative and sets the subtitle text', async () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			fetchTextContent.mockResolvedValue('1\n00:00:00,000 --> 00:00:01,000\nHi.');
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			expect(getObjectById$$$).toHaveBeenCalledWith('file-1', true, true);
			source.next(srtFile);
			await Promise.resolve();
			await Promise.resolve();
			fixture.detectChanges();

			expect(fetchTextContent).toHaveBeenCalled();
			expect(fixture.componentInstance.subtitle()).toBe('1\n00:00:00,000 --> 00:00:01,000\nHi.');
		});

		it('shows nothing when the fetch resolves empty', async () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			fetchTextContent.mockResolvedValue(undefined);
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			source.next(srtFile);
			await Promise.resolve();
			await Promise.resolve();
			fixture.detectChanges();

			expect(fixture.componentInstance.subtitle()).toBe('');
		});

		it('does not fetch when the file has no matching alternative format', async () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			source.next({ ...srtFile, extra: { alternativeFormats: [] } });
			fixture.detectChanges();

			expect(fetchTextContent).not.toHaveBeenCalled();
			expect(fixture.componentInstance.subtitle()).toBe('');
		});

		it('does not fetch when the matching alternative is not a text mime', async () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			source.next({ ...srtFile, extra: { alternativeFormats: [{ storageSuffix: 'whisper_transcript_srt', mime: 'application/json' }] } });
			fixture.detectChanges();

			expect(fetchTextContent).not.toHaveBeenCalled();
		});
	});

	describe('copyToClipboard', () => {
		it('copies the current subtitle text and notifies success', () => {
			const fixture = build();
			fixture.componentRef.setInput('subtitle', 'some text');
			fixture.detectChanges();

			fixture.componentInstance.copyToClipboard();

			expect(navigator.clipboard.writeText).toHaveBeenCalledWith('some text');
		});

		it('does nothing when there is no subtitle text', () => {
			const fixture = build();
			fixture.detectChanges();

			fixture.componentInstance.copyToClipboard();

			expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
		});
	});

	describe('loading from a url', () => {
		it('fetches the url without ever touching the file entity', async () => {
			// A listener on a public or link-shared page holds no rights on the file, so resolving it
			// would fail for exactly the people the page exists for.
			fetchTextContent.mockResolvedValue('1\n00:00:00,000 --> 00:00:01,000\nHi.');
			const fixture = build();
			fixture.componentRef.setInput('url', 'https://api.test/p/proxy-1/whisper_transcript_srt/lesson.srt');
			fixture.detectChanges();
			await Promise.resolve();
			await Promise.resolve();
			fixture.detectChanges();

			expect(fetchTextContent).toHaveBeenCalledWith('https://api.test/p/proxy-1/whisper_transcript_srt/lesson.srt');
			expect(getObjectById$$$).not.toHaveBeenCalled();
			expect(fixture.componentInstance.subtitle()).toContain('Hi.');
		});

		it('stays quiet without a url', () => {
			const fixture = build();
			fixture.detectChanges();

			expect(fetchTextContent).not.toHaveBeenCalled();
		});
	});
});
