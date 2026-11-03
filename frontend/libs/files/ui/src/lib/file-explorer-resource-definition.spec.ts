import { AccessShareModalComponent } from '@foundation/shared/access';
import { TwFileIcon, TwUploadIcon } from '@foundation/icons';
import { Observable, of } from 'rxjs';
import { createFileExplorerResourceDefinition } from './file-explorer-resource-definition';
import { ExplorerFilePreviewComponent } from './explorer-file-preview/explorer-file-preview.component';

describe('createFileExplorerResourceDefinition', () => {
	const buildDefinition = () => {
		const open = vi.fn();
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: of({ id: 'file-1', publicFilename: 'Report.pdf' }) }));
		const handleFileList$ = vi.fn(() => of([]));
		const goToFolder = vi.fn();

		const definition = createFileExplorerResourceDefinition({ store: { getObjectByIdPullOnce$$$ }, handleFileList$ } as never, { goToFolder } as never, { open } as never);

		return { definition, open, getObjectByIdPullOnce$$$, handleFileList$, goToFolder };
	};

	it('declares the file kind with its icon and preview component', () => {
		const { definition } = buildDefinition();

		expect(definition.kind).toBe('file');
		expect(definition.iconComponent).toBe(TwFileIcon);
		expect(definition.previewComponent).toBe(ExplorerFilePreviewComponent);
	});

	it('loads a file through the repository', () => {
		const { definition, getObjectByIdPullOnce$$$ } = buildDefinition();

		definition.load('file-1').subscribe();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('file-1');
	});

	it('names a file from public then original filename, falling back to unknown', () => {
		const { definition } = buildDefinition();

		expect(definition.getName({ id: 'f', publicFilename: 'Report.pdf' } as never)).toBe('Report.pdf');
		expect(definition.getName({ id: 'f', originalFilename: 'orig.pdf' } as never)).toBe('orig.pdf');
		expect(definition.getName({ id: 'f' } as never)).toBe('Unknown file');
	});

	it('badges by kind, falling back to extension and then nothing', () => {
		const { definition } = buildDefinition();

		expect(definition.getTypeBadge?.({ kind: 'document' } as never)).toBe('document');
		expect(definition.getTypeBadge?.({ extension: '.pdf' } as never)).toBe('.pdf');
		expect(definition.getTypeBadge?.({} as never)).toBeNull();
	});

	it('exposes size, and null without one', () => {
		const { definition } = buildDefinition();

		expect(definition.getSize?.({ size: 2048 } as never)).toBe(2048);
		expect(definition.getSize?.({} as never)).toBeNull();
	});

	it('dates by the most recent update, falling back to creation, then nothing', () => {
		const { definition } = buildDefinition();

		expect(definition.getDate?.({ timeUpdated: '2026-01-02T00:00:00Z' } as never)).toBe(new Date('2026-01-02T00:00:00Z').toLocaleDateString());
		expect(definition.getDate?.({ timeCreated: '2026-01-01T00:00:00Z' } as never)).toBe(new Date('2026-01-01T00:00:00Z').toLocaleDateString());
		expect(definition.getDate?.({} as never)).toBeNull();
	});

	it('shares through the access modal, scoped to the file', () => {
		const { definition, open } = buildDefinition();

		definition.onShare({ id: 'file-1' } as never);

		expect(open).toHaveBeenCalledWith(AccessShareModalComponent, { data: { resourceId: 'file-1', resourceKind: 'file' } });
	});

	it('has a download action', () => {
		const { definition } = buildDefinition();

		expect(definition.actions?.[0]?.label).toBe('Download');
		expect(() => definition.actions?.[0]?.onClick({} as never)).not.toThrow();
	});

	describe('createAction', () => {
		const buildInputSpy = () => {
			const created: HTMLInputElement[] = [];
			const originalCreateElement = document.createElement.bind(document);
			const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
				const el = originalCreateElement(tag);
				if (tag === 'input') created.push(el as HTMLInputElement);
				return el;
			});
			return { created, spy };
		};

		it('is labelled Upload File with an upload icon', () => {
			const { definition } = buildDefinition();

			expect(definition.createAction?.label).toBe('Upload File');
			expect(definition.createAction?.iconComponent).toBe(TwUploadIcon);
		});

		it('opens a multi-file picker and uploads into the folder being browsed', () => {
			const { definition, handleFileList$, goToFolder } = buildDefinition();
			const { created, spy } = buildInputSpy();
			const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

			const result = definition.createAction?.onClick('folder-1');
			if (!(result instanceof Observable)) throw new Error('onClick must return an observable so the explorer can refetch');
			const completed = vi.fn();
			result.subscribe({ complete: completed });

			const input = created[0];
			expect(input.type).toBe('file');
			expect(input.multiple).toBe(true);
			expect(clickSpy).toHaveBeenCalledOnce();

			const chosenFiles = [new File(['x'], 'a.pdf')];
			Object.defineProperty(input, 'files', { value: chosenFiles });
			input.onchange?.({ target: input } as unknown as Event);

			expect(handleFileList$).toHaveBeenCalledWith(chosenFiles, { folderId: 'folder-1' });
			// The explorer refetches the folder off this completion; without it the upload stays invisible.
			expect(completed).toHaveBeenCalled();
			// Inside a folder the explorer shows the file in place, so it must stay where it is.
			expect(goToFolder).not.toHaveBeenCalled();

			spy.mockRestore();
			clickSpy.mockRestore();
		});

		it('uploads to the root when no folder is being browsed', () => {
			const { definition, handleFileList$, goToFolder } = buildDefinition();
			const { created, spy } = buildInputSpy();
			vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

			const rootResult = definition.createAction?.onClick(null);
			if (!(rootResult instanceof Observable)) throw new Error('onClick must return an observable');
			rootResult.subscribe();
			const input = created[0];
			Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.pdf')] });
			input.onchange?.({ target: input } as unknown as Event);

			expect(handleFileList$).toHaveBeenCalledWith(expect.anything(), { folderId: undefined });
			// The explorer root never renders files, so the upload has to land somewhere that does.
			expect(goToFolder).toHaveBeenCalledWith(null);

			spy.mockRestore();
		});

		it('does nothing when the picker is dismissed with no files', () => {
			const { definition, handleFileList$, goToFolder } = buildDefinition();
			const { created, spy } = buildInputSpy();
			vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

			const emptyResult = definition.createAction?.onClick(null);
			if (!(emptyResult instanceof Observable)) throw new Error('onClick must return an observable');
			emptyResult.subscribe();
			const input = created[0];
			Object.defineProperty(input, 'files', { value: [] });
			input.onchange?.({ target: input } as unknown as Event);
			input.onchange?.({ target: document.createElement('div') } as unknown as Event);

			expect(handleFileList$).not.toHaveBeenCalled();
			expect(goToFolder).not.toHaveBeenCalled();

			spy.mockRestore();
		});
	});
});
