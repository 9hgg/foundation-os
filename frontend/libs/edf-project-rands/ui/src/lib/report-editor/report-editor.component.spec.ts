import { TestBed } from '@angular/core/testing';
import { ReportConfig } from '@edf/edf-project-rands/models';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { NotificationService } from '@foundation/notification';
import { PdfService } from '@foundation/pdfs';
import { of, throwError } from 'rxjs';
import { ReportEditorComponent } from './report-editor.component';

vi.mock('uuid', () => ({ v4: () => 'new-uuid' }));

describe('ReportEditorComponent', () => {
	const buildFixture = () => {
		const notificationService = {
			error: vi.fn(),
			snackSuccess: vi.fn(),
			confirm: vi.fn(() => ({ closed: of(true) })),
			prompt: vi.fn(() => ({ closed: of({ value: 'New Report' }) })),
		};
		const pdfService = {
			renderPdfUrl$: vi.fn(() => of('blob:pdf-url')),
			renderHtmlBlob$: vi.fn(() => of(new Blob(['html']))),
		};
		const filesRepository = {
			fetchTextContent: vi.fn(async () => '{}'),
			handleFileList$: vi.fn(() => of(undefined)),
		};
		const fileModals = {
			openFilesSelectionDialog: vi.fn(() => ({ closed: of(undefined) })),
		};

		TestBed.configureTestingModule({
			providers: [
				{ provide: NotificationService, useValue: notificationService },
				{ provide: PdfService, useValue: pdfService },
				{ provide: FilesRepository, useValue: filesRepository },
				{ provide: FileModals, useValue: fileModals },
			],
		});
		TestBed.overrideComponent(ReportEditorComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(ReportEditorComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();

		return { fixture, component, notificationService, pdfService, filesRepository, fileModals };
	};

	const baseConfig = (overrides: Partial<ReportConfig> = {}): ReportConfig => ({
		title: 'My report',
		description: '',
		localSyncPath: '',
		template: 'Hello @@intro',
		templates: {
			t1: { key: 'intro', title: 'Intro', content: 'Intro {{ clientName }}' },
			_header: { key: '_header', title: 'Header', content: '' },
		},
		data: {
			v1: { key: 'clientName', title: 'Client', kind: 'text', content: 'ACME' },
		},
		pdfOptions: {},
		...overrides,
	});

	afterEach(() => TestBed.resetTestingModule());

	describe('pdfPayload / pdfPayloadFlat', () => {
		it('is null without availableData or an active report', () => {
			const { component } = buildFixture();
			expect(component.pdfPayload()).toBeNull();
			expect(component.pdfPayloadFlat()).toBeNull();
		});

		it('merges availableData with keyed variable content', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('availableData', { project: { name: 'Alpha' } });
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			fixture.detectChanges();

			expect(component.pdfPayload()).toEqual({ project: { name: 'Alpha' }, clientName: 'ACME' });
		});

		it('falls back to the data id when the variable has no key', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('availableData', {});
			component.reportConfigs.set({ r1: baseConfig({ data: { v1: { key: '', title: 'X', kind: 'text', content: 'val' } } }) });
			component.activeReportId.set('r1');
			fixture.detectChanges();

			expect(component.pdfPayload()).toEqual({ v1: 'val' });
		});

		it('flattens nested objects with dotted keys', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('availableData', { project: { name: 'Alpha', owner: { email: 'a@test.com' } } });
			component.reportConfigs.set({ r1: baseConfig({ data: {} }) });
			component.activeReportId.set('r1');
			fixture.detectChanges();

			expect(component.pdfPayloadFlat()).toEqual({
				'project.name': 'Alpha',
				'project.owner.email': 'a@test.com',
			});
		});
	});

	describe('reports / activeReport', () => {
		it('lists all configured reports', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig({ title: 'A' }), r2: baseConfig({ title: 'B' }) });
			expect(component.reports().map((r) => r.id)).toEqual(['r1', 'r2']);
		});

		it('is null when the active id does not match a config', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('missing');
			expect(component.activeReport()).toBeNull();
		});
	});

	describe('usedTemplateKeys', () => {
		it('is empty without an active report', () => {
			const { component } = buildFixture();
			expect(component.usedTemplateKeys().size).toBe(0);
		});

		it('walks @@ references transitively and always includes header/footer', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({
				r1: baseConfig({
					template: 'Hello @@intro',
					templates: {
						t1: { key: 'intro', title: 'Intro', content: 'See @@details' },
						t2: { key: 'details', title: 'Details', content: 'Nothing more' },
						_footer: { key: '_footer', title: 'Footer', content: 'bye' },
					},
				}),
			});
			component.activeReportId.set('r1');

			expect(component.usedTemplateKeys()).toEqual(new Set(['intro', 'details', '_footer']));
			expect(component.isTemplateUsed('details')).toBe(true);
			expect(component.isTemplateUsed('unused')).toBe(false);
		});
	});

	describe('usedVariableKeys', () => {
		it('is empty when there are no variables', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig({ data: {} }) });
			component.activeReportId.set('r1');
			expect(component.usedVariableKeys().size).toBe(0);
		});

		it('finds jinja identifiers referenced by the main and used templates, ignoring keywords', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({
				r1: baseConfig({
					template: '{% if isCorporate %}@@intro{% endif %}',
					templates: {
						t1: { key: 'intro', title: 'Intro', content: 'Hello {{ clientName }}' },
					},
					data: {
						v1: { key: 'clientName', title: 'Client', kind: 'text', content: 'ACME' },
						v2: { key: 'isCorporate', title: 'Corp', kind: 'text', content: 'true' },
						v3: { key: 'unused', title: 'Unused', kind: 'text', content: 'x' },
					},
				}),
			});
			component.activeReportId.set('r1');

			expect(component.usedVariableKeys()).toEqual(new Set(['isCorporate', 'clientName']));
			expect(component.isVariableUsed('clientName')).toBe(true);
			expect(component.isVariableUsed('unused')).toBe(false);
			expect(component.isVariableUsed('')).toBe(false);
		});
	});

	describe('refreshPdfReport', () => {
		it('errors when no report is active', async () => {
			const { component, notificationService, pdfService } = buildFixture();
			await component.refreshPdfReport();
			expect(notificationService.error).toHaveBeenCalled();
			expect(pdfService.renderPdfUrl$).not.toHaveBeenCalled();
		});

		it('substitutes @@ template parts and sets the pdf url on success', async () => {
			const { fixture, component, pdfService } = buildFixture();
			fixture.componentRef.setInput('availableData', {});
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			await component.refreshPdfReport();

			expect(pdfService.renderPdfUrl$).toHaveBeenCalledWith(
				expect.objectContaining({
					template: 'Hello Intro {{ clientName }}',
					options: expect.objectContaining({ headerTemplate: undefined }),
				})
			);
			expect(component.pdfUrl()).toBe('blob:pdf-url');
			expect(component.isGeneratingPdf()).toBe(false);
		});

		it('notifies and resets the generating flag when the render fails', async () => {
			const { fixture, component, pdfService, notificationService } = buildFixture();
			pdfService.renderPdfUrl$.mockReturnValueOnce(throwError(() => new Error('boom')));
			fixture.componentRef.setInput('availableData', {});
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			await component.refreshPdfReport();

			expect(notificationService.error).toHaveBeenCalledWith('Erreur lors de la génération du PDF.');
			expect(component.isGeneratingPdf()).toBe(false);
		});
	});

	describe('downloadReportAsHtml', () => {
		it('errors when no report is active', () => {
			const { component, notificationService, pdfService } = buildFixture();
			component.downloadReportAsHtml();
			expect(notificationService.error).toHaveBeenCalled();
			expect(pdfService.renderHtmlBlob$).not.toHaveBeenCalled();
		});

		it('triggers a download anchor click on success', () => {
			const { fixture, component, pdfService } = buildFixture();
			fixture.componentRef.setInput('availableData', {});
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			const clickSpy = vi.fn();
			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy, href: '', download: '' } as unknown as HTMLAnchorElement);
			vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:html-url'), revokeObjectURL: vi.fn() });

			component.downloadReportAsHtml();

			expect(pdfService.renderHtmlBlob$).toHaveBeenCalled();
			expect(clickSpy).toHaveBeenCalled();

			createElementSpy.mockRestore();
			vi.unstubAllGlobals();
		});
	});

	describe('import / export JSON', () => {
		it('imports a report json payload from the app and merges it into the active config', () => {
			const { component, fileModals, filesRepository, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			const imported: Partial<ReportConfig> = { title: 'Imported', templates: { t2: { key: 'new', title: 'New', content: 'x' } } };
			fileModals.openFilesSelectionDialog.mockReturnValueOnce({ closed: of({ files: [{ id: 'file-1' }] }) });
			filesRepository.fetchTextContent.mockResolvedValueOnce(JSON.stringify(imported));

			component.importReportJsonFromApp();

			return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
				expect(component.reportConfigs()['r1'].title).toBe('Imported');
				expect(component.reportConfigs()['r1'].templates?.['t2'].key).toBe('new');
				expect(notificationService.snackSuccess).toHaveBeenCalled();
			});
		});

		it('does nothing when the file dialog is cancelled', () => {
			const { component, filesRepository } = buildFixture();
			component.importReportJsonFromApp();
			expect(filesRepository.fetchTextContent).not.toHaveBeenCalled();
		});

		it('reports an error for invalid JSON content', async () => {
			const { component, fileModals, filesRepository, notificationService } = buildFixture();
			fileModals.openFilesSelectionDialog.mockReturnValueOnce({ closed: of({ files: [{ id: 'file-1' }] }) });
			filesRepository.fetchTextContent.mockResolvedValueOnce('not json');

			component.importReportJsonFromApp();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(notificationService.error).toHaveBeenCalledWith('Error importing file: invalid JSON');
		});

		it('saveReportJsonToApp errors without an active report', () => {
			const { fixture, component, notificationService, filesRepository } = buildFixture();
			fixture.componentRef.setInput('availableData', {});
			component.saveReportJsonToApp();
			expect(notificationService.error).toHaveBeenCalled();
			expect(filesRepository.handleFileList$).not.toHaveBeenCalled();
		});

		it('saveReportJsonToApp exports the report config as a file', () => {
			const { fixture, component, filesRepository, notificationService } = buildFixture();
			fixture.componentRef.setInput('availableData', {});
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			component.saveReportJsonToApp();

			expect(filesRepository.handleFileList$).toHaveBeenCalled();
			const [[fileList]] = filesRepository.handleFileList$.mock.calls;
			expect(fileList[0].name).toBe('report-data-r1.json');
			expect(notificationService.snackSuccess).toHaveBeenCalled();
		});

		it('downloadReportJsonFile errors without an active report and downloads otherwise', () => {
			const { component, notificationService } = buildFixture();
			component.downloadReportJsonFile();
			expect(notificationService.error).toHaveBeenCalled();

			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			const clickSpy = vi.fn();
			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy, href: '', download: '' } as unknown as HTMLAnchorElement);
			vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:json-url'), revokeObjectURL: vi.fn() });

			component.downloadReportJsonFile();
			expect(clickSpy).toHaveBeenCalled();

			createElementSpy.mockRestore();
			vi.unstubAllGlobals();
		});
	});

	describe('local folder sync', () => {
		it('exportTemplatesToLocalFolder notifies when the directory picker is unsupported', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			delete (window as any).showDirectoryPicker;

			await component.exportTemplatesToLocalFolder();

			expect(notificationService.error).toHaveBeenCalledWith(expect.stringContaining('not supported'));
		});

		it('exportTemplatesToLocalFolder writes new and changed files after confirmation', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');

			const writable = { write: vi.fn(), close: vi.fn() };
			const fileHandle = { createWritable: vi.fn(async () => writable) };
			const directoryHandle = {
				getFileHandle: vi.fn(async () => fileHandle),
				entries: () =>
					(async function* () {
						for (const entry of [] as never[]) yield entry;
					})(),
			};
			(window as any).showDirectoryPicker = vi.fn(async () => directoryHandle);

			await component.exportTemplatesToLocalFolder();

			expect(directoryHandle.getFileHandle).toHaveBeenCalled();
			expect(writable.write).toHaveBeenCalled();
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Templates exported to local folder.');

			delete (window as any).showDirectoryPicker;
		});

		it('importTemplatesFromLocalFolder reports no changes when the folder matches the config', async () => {
			const { component, notificationService } = buildFixture();
			const config = baseConfig();
			component.reportConfigs.set({ r1: config });
			component.activeReportId.set('r1');

			const manifest = {
				main: { id: '0000', key: '__main__', title: 'Main template', file: '0000__main.html' },
				templates: [{ id: 't1', key: 'intro', title: 'Intro', file: 't1__intro.html' }],
			};
			const files: Record<string, string> = {
				'template-manifest.json': JSON.stringify(manifest),
				'0000__main.html': config.template ?? '',
				't1__intro.html': (config.templates?.['t1'].content as string) ?? '',
				'template-variables.json': JSON.stringify(config.data),
			};
			const directoryHandle = { entries: () => (async function* () { for (const [name, content] of Object.entries(files)) yield [name, { kind: 'file', name, getFile: async () => ({ text: async () => content }) }]; })() };
			(window as any).showDirectoryPicker = vi.fn(async () => directoryHandle);

			await component.importTemplatesFromLocalFolder();

			expect(notificationService.snackSuccess).toHaveBeenCalledWith('No changes to import.');
			delete (window as any).showDirectoryPicker;
		});

		it('importTemplatesFromLocalFolder applies new template content after confirmation', async () => {
			const { component, notificationService } = buildFixture();
			const config = baseConfig();
			component.reportConfigs.set({ r1: config });
			component.activeReportId.set('r1');

			const manifest = {
				main: { id: '0000', key: '__main__', title: 'Main template', file: '0000__main.html' },
				templates: [{ id: 't1', key: 'intro', title: 'Intro', file: 't1__intro.html' }],
			};
			const files: Record<string, string> = {
				'template-manifest.json': JSON.stringify(manifest),
				'0000__main.html': 'Changed main content',
				't1__intro.html': 'Changed intro content',
			};
			const directoryHandle = { entries: () => (async function* () { for (const [name, content] of Object.entries(files)) yield [name, { kind: 'file', name, getFile: async () => ({ text: async () => content }) }]; })() };
			(window as any).showDirectoryPicker = vi.fn(async () => directoryHandle);

			await component.importTemplatesFromLocalFolder();

			expect(component.reportConfigs()['r1'].template).toBe('Changed main content');
			expect(component.reportConfigs()['r1'].templates?.['t1'].content).toBe('Changed intro content');
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Templates imported from local folder.');
			delete (window as any).showDirectoryPicker;
		});
	});

	describe('report CRUD', () => {
		it('addReportConfig creates a new report and makes it active', () => {
			const { component, notificationService } = buildFixture();
			notificationService.prompt.mockReturnValueOnce({ closed: of({ value: 'Brand new' }) });

			component.addReportConfig();

			const configs = component.reportConfigs();
			const [id] = Object.keys(configs);
			expect(configs[id].title).toBe('Brand new');
			expect(component.activeReportId()).toBe(id);
		});

		it('addReportConfig does nothing when the prompt is cancelled', () => {
			const { component, notificationService } = buildFixture();
			notificationService.prompt.mockReturnValueOnce({ closed: of(undefined) });

			component.addReportConfig();

			expect(component.reportConfigs()).toEqual({});
		});

		it('updatePdfOptions parses valid JSON and ignores invalid JSON', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.updatePdfOptions('r1', '{"pageSize":"A3"}');
			expect(component.reportConfigs()['r1'].pdfOptions).toEqual({ pageSize: 'A3' });

			component.updatePdfOptions('r1', 'not json');
			expect(component.reportConfigs()['r1'].pdfOptions).toEqual({ pageSize: 'A3' });
		});

		it('deleteReportConfig removes the config and clears the active id when it was active', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig(), r2: baseConfig() });
			component.activeReportId.set('r1');

			component.deleteReportConfig('r1');

			expect(component.reportConfigs()['r1']).toBeUndefined();
			expect(component.activeReportId()).toBe('r2');
		});

		it('deleteReportConfig does nothing when not confirmed', () => {
			const { component, notificationService } = buildFixture();
			notificationService.confirm.mockReturnValueOnce({ closed: of(false) });
			component.reportConfigs.set({ r1: baseConfig() });

			component.deleteReportConfig('r1');

			expect(component.reportConfigs()['r1']).toBeDefined();
		});

		it('updates title, description and local sync path directly', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.updateReportTitle('r1', 'Renamed');
			component.updateReportDescription('r1', 'Desc');
			component.updateReportLocalSyncPath('r1', '/tmp/x');

			const config = component.reportConfigs()['r1'];
			expect(config.title).toBe('Renamed');
			expect(config.description).toBe('Desc');
			expect(config.localSyncPath).toBe('/tmp/x');
		});
	});

	describe('debounced template/variable updates', () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		it('applies the template update only after the debounce window', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.updateReportTemplate('r1', 'New main template');
			expect(component.reportConfigs()['r1'].template).toBe('Hello @@intro');

			vi.advanceTimersByTime(500);
			expect(component.reportConfigs()['r1'].template).toBe('New main template');
		});

		it('applies a template part update after the debounce window', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.updateReportTemplatePart('r1', 't1', 'Updated intro');
			vi.advanceTimersByTime(500);

			expect(component.reportConfigs()['r1'].templates?.['t1'].content).toBe('Updated intro');
		});

		it('applies a variable field update after the debounce window', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.updateReportVariableField('r1', 'v1', 'content', 'New value');
			vi.advanceTimersByTime(500);

			expect(component.reportConfigs()['r1'].data['v1'].content).toBe('New value');
		});
	});

	describe('template parts', () => {
		it('deleteTemplatePart removes the part once confirmed', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.deleteTemplatePart('r1', 't1');

			expect(component.reportConfigs()['r1'].templates?.['t1']).toBeUndefined();
		});

		it('promptEditTemplateTitle updates the title', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			notificationService.prompt.mockReturnValueOnce({ closed: of({ value: 'Renamed title' }) });

			component.promptEditTemplateTitle('r1', 't1');

			expect(component.reportConfigs()['r1'].templates?.['t1'].title).toBe('Renamed title');
		});

		it('promptEditTemplateTitle does nothing for an unknown template id', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.promptEditTemplateTitle('r1', 'missing');

			expect(notificationService.prompt).not.toHaveBeenCalled();
		});

		it('promptEditTemplateKey rejects a key already in use', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			notificationService.prompt.mockReturnValueOnce({ closed: of({ value: '_header' }) });

			component.promptEditTemplateKey('r1', 't1');

			expect(notificationService.error).toHaveBeenCalled();
			expect(component.reportConfigs()['r1'].templates?.['t1'].key).toBe('intro');
		});

		it('promptEditTemplateKey applies a free key', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			notificationService.prompt.mockReturnValueOnce({ closed: of({ value: 'brand-new-key' }) });

			component.promptEditTemplateKey('r1', 't1');

			expect(component.reportConfigs()['r1'].templates?.['t1'].key).toBe('brand-new-key');
		});

		it('createNewSubTemplate adds a template part from raw inputs', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			const titleInput = { value: 'Conclusion' } as HTMLInputElement;
			const keyInput = { value: 'conclusion' } as HTMLInputElement;
			const contentInput = { value: 'The end' } as HTMLTextAreaElement;

			component.createNewSubTemplate('r1', titleInput, keyInput, contentInput);

			const templates = component.reportConfigs()['r1'].templates ?? {};
			const added = Object.values(templates).find((t) => t.key === 'conclusion');
			expect(added).toEqual({ title: 'Conclusion', key: 'conclusion', content: 'The end' });
			expect(keyInput.value).toBe('');
			expect(contentInput.value).toBe('');
		});

		it('createNewSubTemplate rejects an empty key or content', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			const emptyKey = { value: '' } as HTMLInputElement;
			const content = { value: 'x' } as HTMLTextAreaElement;

			component.createNewSubTemplate('r1', { value: 'T' } as HTMLInputElement, emptyKey, content);

			expect(Object.keys(component.reportConfigs()['r1'].templates ?? {})).toHaveLength(2);
		});
	});

	describe('report variables', () => {
		it('deleteReportVariable removes the variable once confirmed', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.deleteReportVariable('r1', 'v1');

			expect(component.reportConfigs()['r1'].data['v1']).toBeUndefined();
		});

		it('addReportVariable adds a new variable and resets the editing signals', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.newVariableKind.set('quill');
			component.newVariableContent.set('draft');
			const keyInput = { value: 'newVar' } as HTMLInputElement;
			const titleInput = { value: 'New Var' } as HTMLInputElement;

			component.addReportVariable('r1', keyInput, titleInput, 'quill', 'draft');

			const data = component.reportConfigs()['r1'].data;
			const added = Object.values(data).find((v) => v.key === 'newVar');
			expect(added).toEqual({ title: 'New Var', key: 'newVar', kind: 'quill', content: 'draft' });
			expect(keyInput.value).toBe('');
			expect(component.newVariableKind()).toBe('text');
			expect(component.newVariableContent()).toBe('');
		});

		it('addReportVariable rejects an empty key', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			const keyInput = { value: '' } as HTMLInputElement;

			component.addReportVariable('r1', keyInput, { value: 'X' } as HTMLInputElement, 'text', 'y');

			expect(Object.keys(component.reportConfigs()['r1'].data)).toHaveLength(1);
		});
	});

	describe('onTextareaCursorActivity', () => {
		const buildEvent = (value: string, cursor: number) => ({ target: { value, selectionStart: cursor } }) as unknown as Event;

		it('captures the word under the cursor', () => {
			const { component } = buildFixture();
			component.onTextareaCursorActivity(buildEvent('hello world', 2), 'main');
			expect(component.currentWord()).toEqual({ word: 'hello', source: 'main' });
		});

		it('clears the word when the cursor sits between two whitespace characters', () => {
			const { component } = buildFixture();
			component.onTextareaCursorActivity(buildEvent('a  b', 2), 'main');
			expect(component.currentWord()).toBeNull();
		});
	});

	describe('expansion toggles', () => {
		it('toggles a key in and out of the expanded templates set', () => {
			const { component } = buildFixture();
			component.toggleTemplateExpansion('intro');
			expect(component.expandedTemplates().has('intro')).toBe(true);

			component.toggleTemplateExpansion('intro');
			expect(component.expandedTemplates().has('intro')).toBe(false);
		});

		it('toggles a key in and out of the expanded variables set', () => {
			const { component } = buildFixture();
			component.toggleVariableExpansion('clientName');
			expect(component.expandedVariables().has('clientName')).toBe(true);

			component.toggleVariableExpansion('clientName');
			expect(component.expandedVariables().has('clientName')).toBe(false);
		});
	});

	describe('importReportJsonFromFileSystem', () => {
		afterEach(() => {
			delete (window as any).showOpenFilePicker;
		});

		it('reads the picked file and applies the imported JSON', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig({ title: 'Old' }) });
			component.activeReportId.set('r1');
			const fileHandle = { getFile: async () => ({ text: async () => JSON.stringify({ title: 'From disk', data: {} }) }) };
			(window as any).showOpenFilePicker = async () => [fileHandle];

			await component.importReportJsonFromFileSystem();

			expect(component.reportConfigs()['r1'].title).toBe('From disk');
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Report updated from imported file.');
		});

		it('does nothing when the picker is cancelled', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig({ title: 'Old' }) });
			component.activeReportId.set('r1');
			(window as any).showOpenFilePicker = async () => {
				throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
			};

			await component.importReportJsonFromFileSystem();

			expect(component.reportConfigs()['r1'].title).toBe('Old');
			expect(notificationService.error).not.toHaveBeenCalled();
		});

		it('reports invalid JSON from disk', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			const fileHandle = { getFile: async () => ({ text: async () => 'not json' }) };
			(window as any).showOpenFilePicker = async () => [fileHandle];

			await component.importReportJsonFromFileSystem();

			expect(notificationService.error).toHaveBeenCalledWith('Error importing JSON file: invalid JSON');
		});
	});

	describe('additional edge cases', () => {
		it('onTextareaCursorActivity clears the word when selectionStart is unavailable', () => {
			const { component } = buildFixture();
			const event = { target: { value: 'hello world', selectionStart: null } } as unknown as Event;

			component.onTextareaCursorActivity(event, 'main');

			expect(component.currentWord()).toBeNull();
		});

		it('createNewSubTemplate rejects a duplicate key', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });

			component.createNewSubTemplate('r1', { value: 'Dup' } as HTMLInputElement, { value: 'intro' } as HTMLInputElement, { value: 'content' } as HTMLTextAreaElement);

			expect(notificationService.error).toHaveBeenCalledWith('Template key "intro" is already used.');
			expect(Object.keys(component.reportConfigs()['r1'].templates ?? {})).toHaveLength(2);
		});

		it('promptEditTemplateKey allows keeping the same key on the same template', () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			notificationService.prompt.mockReturnValueOnce({ closed: of({ value: 'intro' }) });

			component.promptEditTemplateKey('r1', 't1');

			expect(notificationService.error).not.toHaveBeenCalled();
			expect(component.reportConfigs()['r1'].templates?.['t1'].key).toBe('intro');
		});

		it('addReportVariable defaults the title to the key when the title input is blank', () => {
			const { component } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			const keyInput = { value: 'siteName' } as HTMLInputElement;
			const titleInput = { value: '' } as HTMLInputElement;

			component.addReportVariable('r1', keyInput, titleInput, 'text', 'Paris');

			const added = Object.values(component.reportConfigs()['r1'].data).find((v) => v.key === 'siteName');
			expect(added).toEqual({ title: 'siteName', key: 'siteName', kind: 'text', content: 'Paris' });
		});
	});

	describe('local folder sync — extra branches', () => {
		afterEach(() => {
			delete (window as any).showDirectoryPicker;
		});

		it('exportTemplatesToLocalFolder does nothing when the picker is cancelled', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			(window as any).showDirectoryPicker = async () => {
				throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
			};

			await component.exportTemplatesToLocalFolder();

			expect(notificationService.error).not.toHaveBeenCalled();
		});

		it('exportTemplatesToLocalFolder reports an error when the picker throws unexpectedly', async () => {
			const { component, notificationService } = buildFixture();
			component.reportConfigs.set({ r1: baseConfig() });
			component.activeReportId.set('r1');
			(window as any).showDirectoryPicker = async () => {
				throw new Error('permission denied');
			};

			await component.exportTemplatesToLocalFolder();

			expect(notificationService.error).toHaveBeenCalledWith('Unable to access local folder.');
		});

		it('exportTemplatesToLocalFolder finds nothing left to export the second time around', async () => {
			const { component, notificationService } = buildFixture();
			const config: ReportConfig = { title: 'X', description: '', localSyncPath: '', template: 'Hello', templates: {}, data: {}, pdfOptions: {} };
			component.reportConfigs.set({ r1: config });
			component.activeReportId.set('r1');

			// Two directory-handle mocks sharing the same `written` map: the first captures a real
			// export's output so the second round-trips it back in as the folder's existing content,
			// instead of hand-deriving the manifest's stable-stringified bytes.
			const written: Record<string, string> = {};
			const makeHandle = (existing: Record<string, string>) => ({
				entries: () =>
					(async function* () {
						for (const [name, content] of Object.entries(existing)) yield [name, { kind: 'file', name, getFile: async () => ({ text: async () => content }) }];
					})(),
				getFileHandle: vi.fn(async (fileName: string) => ({
					createWritable: async () => ({
						write: async (content: string) => {
							written[fileName] = content;
						},
						close: async () => undefined,
					}),
				})),
			});

			(window as any).showDirectoryPicker = vi.fn(async () => makeHandle({}));
			await component.exportTemplatesToLocalFolder();
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Templates exported to local folder.');

			notificationService.confirm.mockClear();
			notificationService.snackSuccess.mockClear();
			(window as any).showDirectoryPicker = vi.fn(async () => makeHandle({ ...written }));

			await component.exportTemplatesToLocalFolder();

			expect(notificationService.confirm).not.toHaveBeenCalled();
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('No changes to export.');
		});
	});
});
