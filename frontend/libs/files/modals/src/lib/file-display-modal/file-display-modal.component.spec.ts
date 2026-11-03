import { EntityFile } from '@foundation/files/models';
import { FileDisplayModalComponent, FileDisplayModalData } from './file-display-modal.component';

function file(id: string, extra: Partial<EntityFile> = {}): EntityFile {
	return { id, ...extra } as EntityFile;
}

function build(data: FileDisplayModalData) {
	const dialogRef = { close: vi.fn() };
	const component = new FileDisplayModalComponent(dialogRef as never, data);
	return { component, dialogRef };
}

describe('FileDisplayModalComponent', () => {
	it('is exported', () => {
		expect(FileDisplayModalComponent).toBeDefined();
	});

	it('starts on the clicked file within the slideshow', () => {
		const files = [file('a'), file('b'), file('c')];
		const { component } = build({ entityFile: files[1], files });
		expect(component.currentFile().id).toBe('b');
	});

	it('falls back to the entityFile when it is not among files, and defaults to a single-file list', () => {
		const clicked = file('x');
		const { component: withoutFilesArray } = build({ entityFile: clicked });
		expect(withoutFilesArray.files).toEqual([clicked]);
		expect(withoutFilesArray.currentIndex()).toBe(0);
		expect(withoutFilesArray.isSlideshow()).toBe(false);

		const { component: notFound } = build({ entityFile: file('missing'), files: [file('a'), file('b')] });
		expect(notFound.currentIndex()).toBe(0);
	});

	it('is a slideshow only with more than one file', () => {
		const { component: single } = build({ entityFile: file('a'), files: [file('a')] });
		expect(single.isSlideshow()).toBe(false);

		const { component: multi } = build({ entityFile: file('a'), files: [file('a'), file('b')] });
		expect(multi.isSlideshow()).toBe(true);
	});

	describe('currentTitle', () => {
		it('prefers the explicit title', () => {
			const { component } = build({ entityFile: file('a'), title: 'Explicit title' });
			expect(component.currentTitle()).toBe('Explicit title');
		});

		it('falls back to publicFilename, then originalFilename, then id', () => {
			const { component: withPublic } = build({ entityFile: file('a', { publicFilename: 'public.jpg', originalFilename: 'orig.jpg' } as never) });
			expect(withPublic.currentTitle()).toBe('public.jpg');

			const { component: withOriginal } = build({ entityFile: file('a', { originalFilename: 'orig.jpg' } as never) });
			expect(withOriginal.currentTitle()).toBe('orig.jpg');

			const { component: withNeither } = build({ entityFile: file('a') });
			expect(withNeither.currentTitle()).toBe('a');
		});
	});

	describe('navigation', () => {
		it('previous/next wrap around the file list', () => {
			const files = [file('a'), file('b'), file('c')];
			const { component } = build({ entityFile: files[0], files });

			component.previous();
			expect(component.currentFile().id).toBe('c');

			component.next();
			component.next();
			expect(component.currentFile().id).toBe('b');
		});

		it('onKeydown navigates with arrow keys only during a slideshow', () => {
			const files = [file('a'), file('b')];
			const { component } = build({ entityFile: files[0], files });

			component.onKeydown({ key: 'ArrowRight' } as KeyboardEvent);
			expect(component.currentFile().id).toBe('b');

			component.onKeydown({ key: 'ArrowLeft' } as KeyboardEvent);
			expect(component.currentFile().id).toBe('a');

			component.onKeydown({ key: 'Escape' } as KeyboardEvent);
			expect(component.currentFile().id).toBe('a');
		});

		it('onKeydown does nothing outside a slideshow', () => {
			const { component } = build({ entityFile: file('a'), files: [file('a')] });

			component.onKeydown({ key: 'ArrowRight' } as KeyboardEvent);

			expect(component.currentFile().id).toBe('a');
		});
	});

	describe('runAction', () => {
		it('calls onClick with the current file and advances by default', () => {
			const files = [file('a'), file('b')];
			const onClick = vi.fn();
			const action = { label: 'Confirmer', onClick };
			const { component } = build({ entityFile: files[0], files, actions: [action] });

			component.runAction(action);

			expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
			expect(component.currentFile().id).toBe('b');
		});

		it('closes when afterClick is close', () => {
			const action = { label: 'x', onClick: vi.fn(), afterClick: 'close' as const };
			const { component, dialogRef } = build({ entityFile: file('a'), actions: [action] });
			component.runAction(action);
			expect(dialogRef.close).toHaveBeenCalledOnce();
		});

		it('goes back when afterClick is prev', () => {
			const files = [file('a'), file('b')];
			const action = { label: 'x', onClick: vi.fn(), afterClick: 'prev' as const };
			const { component } = build({ entityFile: files[0], files, actions: [action] });

			component.runAction(action);

			expect(component.currentFile().id).toBe('b');
		});
	});

	describe('close', () => {
		it('closes the dialog', () => {
			const { component, dialogRef } = build({ entityFile: file('a') });
			component.close();
			expect(dialogRef.close).toHaveBeenCalledOnce();
		});
	});

	describe('highlight box', () => {
		it('shows a highlight only on the file it was requested for', () => {
			const files = [file('a'), file('b')];
			const { component } = build({ entityFile: files[0], files, highlightBox: { x: 0, y: 0, width: 10, height: 10 } });

			expect(component.showHighlight()).toBe(true);

			component.next();
			expect(component.showHighlight()).toBe(false);
		});

		it('has no highlight style without a highlightBox', () => {
			const { component } = build({ entityFile: file('a') });
			expect(component.highlightStyle()).toBeNull();
		});

		it('has no highlight style when neither the file nor the loaded image carries dimensions', () => {
			const { component } = build({ entityFile: file('a'), highlightBox: { x: 0, y: 0, width: 10, height: 10 } });
			expect(component.highlightStyle()).toBeNull();
		});

		it('computes percentage-based highlight geometry from the source file dimensions', () => {
			const { component } = build({
				entityFile: file('a', { extra: { width: 200, height: 100 } } as never),
				highlightBox: { x: 20, y: 10, width: 40, height: 25 },
			});

			expect(component.highlightStyle()).toEqual({ left: '10%', top: '10%', width: '20%', height: '25%' });
		});

		it('falls back to the naturally loaded image size when the file has none', () => {
			const { component } = build({ entityFile: file('a'), highlightBox: { x: 10, y: 10, width: 50, height: 50 } });

			component.onHighlightImageLoad({ target: { naturalWidth: 100, naturalHeight: 100 } } as unknown as Event);

			expect(component.highlightStyle()).toEqual({ left: '10%', top: '10%', width: '50%', height: '50%' });
		});
	});
});
