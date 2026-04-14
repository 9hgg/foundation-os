import { CdkMenu, CdkMenuItem, CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ProjectBasicDataType, ReportConfig, TemplateData } from '@edf/edf-project-rands/models';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { TwMoreVerticalIcon } from '@foundation/icons';
import { NotificationService } from '@foundation/notification';
import { PdfRenderRequest, PdfService, PdfViewerComponent } from '@foundation/pdfs';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { debounceTime, groupBy, mergeMap, Subject, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

interface TemplateManifestEntry {
	id: string;
	key: string;
	title: string;
	file: string;
}

interface TemplateManifest {
	main: TemplateManifestEntry;
	templates: TemplateManifestEntry[];
}

@Component({
	selector: 'lib-report-editor',
	standalone: true,
	imports: [CommonModule, FormsModule, PdfViewerComponent, CdkMenuModule, CdkMenu, CdkMenuItem, CdkMenuTrigger, KeyValuePipe, QuillTextareaComponent, TwMoreVerticalIcon],
	templateUrl: './report-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportEditorComponent {
	private _notificationService = inject(NotificationService);
	private _pdfService = inject(PdfService);
	private _filesRepository = inject(FilesRepository);
	private _fileModals = inject(FileModals);

	public availableData = input<Record<string, unknown> | null>(null);

	public reportConfigs = model<Record<string, ReportConfig>>({});
	public activeReportId = model<string | null>(null);

	private _templateUpdate$ = new Subject<{ reportId: string; template: string }>();
	private _templatePartUpdate$ = new Subject<{ reportId: string; id: string; content: string }>();
	private _variableFieldUpdate$ = new Subject<{ reportId: string; id: string; field: keyof ProjectBasicDataType; value: string }>();

	public pdfUrl = signal<string | null>(null);
	public isGeneratingPdf = signal<boolean>(false);
	public currentWord = signal<{ word: string; source: string } | null>(null);
	public expandedTemplates = signal<Set<string>>(new Set());
	public expandedVariables = signal<Set<string>>(new Set());

	public newVariableKind = signal<string>('text');
	public newVariableContent = signal<string>('');
	private readonly _mainTemplateFileId = '0000';
	private readonly _templateManifestFileName = 'template-manifest.json';
	private readonly _templateVariablesFileName = 'template-variables.json';

	// Default PDF options that will be used for new reports
	public readonly defaultPdfOptions: Record<string, unknown> = {
		pageSize: 'A4',
		marginBottom: '2cm',
		marginTop: '2cm',
		marginLeft: '1cm',
		marginRight: '1cm',
		engine: 'playwright',
	};

	public pdfPayload = computed<Record<string, unknown> | null>(() => {
		const availableData = this.availableData();
		const activeReport = this.activeReport();

		if (!availableData || !activeReport) return null;

		const reportConfig = activeReport.config;

		// Add variables from config data
		const variablesMap: Record<string, unknown> = {};
		if (reportConfig.data) {
			Object.entries(reportConfig.data).forEach(([extraParameterId, variable]) => {
				if (variable.content && typeof variable.content === 'string') {
					if (variable.key) {
						variablesMap[variable.key] = variable.content;
					} else {
						variablesMap[extraParameterId] = variable.content;
					}
				}
			});
		}

		// Merge with availableData
		const payload = {
			...availableData,
			...variablesMap,
		};
		console.log('[ReportEditorComponent] pdfPayload computed', { payload });
		return payload;
	});

	public pdfPayloadFlat = computed<Record<string, unknown> | null>(() => {
		const payload = this.pdfPayload();
		if (!payload) return null;

		const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
			const result: Record<string, unknown> = {};
			for (const key in obj) {
				const value = obj[key];
				const newKey = prefix ? `${prefix}.${key}` : key;
				if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					Object.assign(result, flatten(value as Record<string, unknown>, newKey));
				} else {
					result[newKey] = value;
				}
			}
			return result;
		};

		const flatPayload = flatten(payload);
		console.log('[ReportEditorComponent] pdfPayloadFlat computed', { flatPayload });
		return flatPayload;
	});

	activeReport = computed(() => {
		const id = this.activeReportId();
		console.log('[ReportEditorComponent] activeReport computed, activeReportId:', id);
		const configs = this.reportConfigs();
		return id && configs[id] ? { id, config: configs[id] } : null;
	});

	reports = computed(() => {
		return Object.entries(this.reportConfigs() ?? {}).map(([id, config]) => ({ id, config }));
	});

	usedTemplateKeys = computed<Set<string>>(() => {
		const activeReport = this.activeReport();
		if (!activeReport) return new Set<string>();

		const templatesByKey = new Map<string, string>();
		Object.values(activeReport.config.templates ?? {}).forEach((templateData) => {
			if (!templateData?.key) return;
			templatesByKey.set(templateData.key, (templateData.content ?? '').toString());
		});

		const used = new Set<string>();
		const queue: string[] = [];
		const mainTemplate = (activeReport.config.template ?? '').toString();

		this._extractTemplateRefs(mainTemplate).forEach((key) => queue.push(key));
		if (templatesByKey.has('_header')) queue.push('_header');
		if (templatesByKey.has('_footer')) queue.push('_footer');

		while (queue.length > 0) {
			const templateKey = queue.shift();
			if (!templateKey || used.has(templateKey)) continue;
			used.add(templateKey);

			const content = templatesByKey.get(templateKey);
			if (!content) continue;

			this._extractTemplateRefs(content).forEach((childKey) => {
				if (!used.has(childKey)) queue.push(childKey);
			});
		}

		return used;
	});

	usedVariableKeys = computed<Set<string>>(() => {
		const activeReport = this.activeReport();
		if (!activeReport) return new Set<string>();

		const variableKeys = new Set<string>();
		Object.values(activeReport.config.data ?? {}).forEach((variable) => {
			if (variable?.key) variableKeys.add(variable.key);
		});
		if (variableKeys.size === 0) return new Set<string>();

		const templatesByKey = new Map<string, string>();
		Object.values(activeReport.config.templates ?? {}).forEach((templateData) => {
			if (!templateData?.key) return;
			templatesByKey.set(templateData.key, (templateData.content ?? '').toString());
		});

		const templateTexts: string[] = [(activeReport.config.template ?? '').toString()];
		this.usedTemplateKeys().forEach((templateKey) => {
			templateTexts.push((templatesByKey.get(templateKey) ?? '').toString());
		});

		const usedVariables = new Set<string>();
		templateTexts.forEach((text) => {
			const identifiers = this._extractJinjaIdentifiers(text);
			identifiers.forEach((identifier) => {
				if (variableKeys.has(identifier)) usedVariables.add(identifier);
			});
		});

		return usedVariables;
	});

	constructor() {
		effect(() => {
			this.pdfPayloadFlat(); // Just to log it whenever it changes
		});

		// Debounce template updates
		this._templateUpdate$
			.pipe(
				takeUntilDestroyed(),
				groupBy((x) => x.reportId),
				mergeMap((group) => group.pipe(debounceTime(500)))
			)
			.subscribe(({ reportId, template }) => {
				this._updateReportConfig(reportId, (config) => ({ ...config, template }));
			});

		// Debounce template part updates
		this._templatePartUpdate$
			.pipe(
				takeUntilDestroyed(),
				groupBy((x) => `${x.reportId}:${x.id}`),
				mergeMap((group) => group.pipe(debounceTime(500)))
			)
			.subscribe(({ reportId, id, content }) => {
				this._updateReportConfig(reportId, (config) => {
					const templates = { ...(config.templates ?? {}) };
					if (templates[id]) {
						templates[id] = { ...templates[id], content };
					}
					return { ...config, templates };
				});
			});

		// Debounce variable field updates
		this._variableFieldUpdate$
			.pipe(
				takeUntilDestroyed(),
				groupBy((x) => `${x.reportId}:${x.id}:${x.field}`),
				mergeMap((group) => group.pipe(debounceTime(500)))
			)
			.subscribe(({ reportId, id, field, value }) => {
				this._updateReportConfig(reportId, (config) => {
					const data = { ...(config.data ?? {}) };
					const variable = data[id];
					if (variable) {
						data[id] = { ...variable, [field]: value };
					}
					return { ...config, data };
				});
			});
	}

	public async refreshPdfReport() {
		const payload = this.pdfPayload();
		const activeReport = this.activeReport();

		if (!activeReport) {
			this._notificationService.error('Veuillez sélectionner un rapport à générer.');
			return;
		}

		if (!payload) return;

		this.isGeneratingPdf.set(true);
		try {
			const reportConfig = activeReport.config;
			const template = reportConfig.template || '';
			const templatesMap: Record<string, string> = {};

			// Add report specific templates
			if (reportConfig.templates) {
				Object.values(reportConfig.templates).forEach((templateData) => {
					if (templateData.content && typeof templateData.content === 'string') {
						templatesMap[templateData.key] = templateData.content;
					}
				});
			}

			const pdfOptions = { ...this.defaultPdfOptions, ...(reportConfig.pdfOptions || {}) };

			// replace @@<key> by template parts
			// 1. Extract template parts from the main template (e.g. @@myPart) and replace them by the content of the corresponding template in templatesMap
			// 2. If a template part is missing in templatesMap, replace it by an empty string
			// 3. Repeat until no more template parts are found or max depth is reached
			let templateWithParts = template;
			let depth = 0;
			const maxDepth = 20;

			while (depth < maxDepth) {
				const matches = templateWithParts.match(/@@(\w+)/);
				if (!matches) break;

				const previousTemplate = templateWithParts;
				templateWithParts = templateWithParts.replace(/@@(\w+)/g, (match, p1) => {
					if (Object.prototype.hasOwnProperty.call(templatesMap, p1)) {
						return templatesMap[p1];
					} else {
						return '';
					}
				});

				if (templateWithParts === previousTemplate) {
					// Avoid infinite loop if a template replaces to same content
					break;
				}
				depth++;
			}

			if (depth >= maxDepth) {
				console.warn('Max recursion depth reached for template replacement. Check for circular references.');
			}

			// replace \n by <br> in the final payload to allow multiline
			// const templateWithPartsAndMultiline = templateWithParts.replace(/\n/g, '<br>');
			const templateWithPartsAndMultiline = templateWithParts;

			const request: PdfRenderRequest = {
				documentType: 'report-editor',
				payload,
				options: {
					...pdfOptions,
					// We might want to construct headers/footers from templatesMap if they are defined there
					headerTemplate: templatesMap['_header'],
					footerTemplate: templatesMap['_footer'],
				},
				template: templateWithPartsAndMultiline,
			};

			console.log('[ReportEditorComponent] refreshPdfReport', { request });

			const url = await new Promise<string>((resolve, reject) => {
				this._pdfService.renderPdfUrl$(request).subscribe({
					next: (u) => resolve(u),
					error: (e) => reject(e),
				});
			});

			this.pdfUrl.set(url);
		} catch (error) {
			console.error('Error generating PDF:', error);
			this._notificationService.error('Erreur lors de la génération du PDF.');
		} finally {
			this.isGeneratingPdf.set(false);
		}
	}

	public downloadReportAsHtml() {
		const payload = this.pdfPayload();
		const activeReport = this.activeReport();

		if (!activeReport) {
			this._notificationService.error('Veuillez sélectionner un rapport à générer.');
			return;
		}

		if (!payload) return;

		const reportConfig = activeReport.config;
		const templatesMap: Record<string, string> = {};

		if (reportConfig.templates) {
			Object.values(reportConfig.templates).forEach((templateData) => {
				if (templateData.content && typeof templateData.content === 'string') {
					templatesMap[templateData.key] = templateData.content;
				}
			});
		}

		const pdfOptions = { ...this.defaultPdfOptions, ...(reportConfig.pdfOptions || {}) };

		let templateWithParts = reportConfig.template || '';
		let depth = 0;
		const maxDepth = 20;

		while (depth < maxDepth) {
			const matches = templateWithParts.match(/@@(\w+)/);
			if (!matches) break;

			const previousTemplate = templateWithParts;
			templateWithParts = templateWithParts.replace(/@@(\w+)/g, (match, p1) => {
				if (Object.prototype.hasOwnProperty.call(templatesMap, p1)) {
					return templatesMap[p1];
				} else {
					return '';
				}
			});

			if (templateWithParts === previousTemplate) break;
			depth++;
		}

		const request: PdfRenderRequest = {
			documentType: 'report-editor',
			payload,
			options: {
				...pdfOptions,
				headerTemplate: templatesMap['_header'],
				footerTemplate: templatesMap['_footer'],
			},
			template: templateWithParts,
		};

		this._pdfService.renderHtmlBlob$(request).subscribe({
			next: (blob) => {
				const url = window.URL.createObjectURL(blob);
				const anchor = document.createElement('a');
				anchor.href = url;
				anchor.download = `${reportConfig.title || 'report'}.html`;
				anchor.click();
				window.URL.revokeObjectURL(url);
			},
			error: (error) => {
				console.error('Error generating HTML:', error);
				this._notificationService.error('Erreur lors de la génération du HTML.');
			},
		});
	}

	public importReportJsonFromApp() {
		const dialogRef = this._fileModals.openFilesSelectionDialog({
			selectionConstraints: {
				single: true,
				maxFiles: 1,
				minFiles: 1,
			},
		});

		dialogRef.closed
			.pipe(
				switchMap((result) => {
					if (!result || !result.files || result.files.length === 0) return [];
					const file = result.files[0];
					const url = `/api/files/storage/read/${file.id}/default?download=true`;
					return this._filesRepository.fetchTextContent(url);
				})
			)
			.subscribe({
				next: (payloadString) => {
					if (!payloadString) {
						this._notificationService.error('Error importing file: empty content');
						return;
					}
					try {
						// Typed as any momentarily to allow checking missing fields
						const payload = JSON.parse(payloadString);
						this._applyImportedPayload(payload);
					} catch (e) {
						console.error('Error parsing JSON:', e);
						this._notificationService.error('Error importing file: invalid JSON');
					}
				},
				error: (err) => {
					console.error('Error importing file:', err);
					this._notificationService.error('Error importing file.');
				},
			});
	}

	public async importReportJsonFromFileSystem() {
		try {
			const payloadString = await this._pickJsonFileContent();
			if (!payloadString) return;
			const payload = JSON.parse(payloadString);
			this._applyImportedPayload(payload);
		} catch (e) {
			console.error('Error importing JSON from file system:', e);
			this._notificationService.error('Error importing JSON file: invalid JSON');
		}
	}

	public saveReportJsonToApp() {
		const availableData = this.availableData();
		if (!availableData) return;

		const activeReport = this.activeReport();
		if (!activeReport) {
			this._notificationService.error('Please select a report to export.');
			return;
		}

		// Only export the ReportConfig, as per requirement "What is exported and import should always be typed to be a ReportConfig."
		// We do NOT export the merged data (with availableData).
		const reportConfig: ReportConfig = activeReport.config;
		const json = JSON.stringify(reportConfig, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const file = new File([blob], `report-data-${activeReport.id}.json`, { type: 'application/json' });

		this._filesRepository.handleFileList$([file]).subscribe({
			next: () => {
				this._notificationService.snackSuccess('Report exported to app successfully.');
			},
			error: (err) => {
				console.error('Error exporting to app:', err);
				this._notificationService.error('Error exporting to app.');
			},
		});
	}

	public async exportTemplatesToLocalFolder() {
		const activeReport = this.activeReport();
		if (!activeReport) {
			this._notificationService.error('Please select a report to export.');
			return;
		}

		const directoryHandle = await this._pickDirectoryHandle('readwrite');
		if (!directoryHandle) return;

		const filesToWrite = this._buildFilesMapForExport(activeReport.config);
		const existingFiles = await this._readSyncFilesFromDirectory(directoryHandle);
		const preview = this._buildExportPreview(filesToWrite, existingFiles);

		if (preview.create.length === 0 && preview.overwrite.length === 0) {
			this._notificationService.snackSuccess('No changes to export.');
			return;
		}

		const confirmed = await this._confirmSync('Export templates to local folder', this._buildPreviewMessage(preview, []), 'Export');
		if (!confirmed) return;

		for (const fileName of [...preview.create, ...preview.overwrite]) {
			const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(filesToWrite[fileName]);
			await writable.close();
		}

		this._notificationService.snackSuccess('Templates exported to local folder.');
	}

	public async importTemplatesFromLocalFolder() {
		const activeReport = this.activeReport();
		if (!activeReport) {
			this._notificationService.error('Please select a report to import.');
			return;
		}

		const directoryHandle = await this._pickDirectoryHandle('read');
		if (!directoryHandle) return;

		const localFiles = await this._readSyncFilesFromDirectory(directoryHandle);
		const importPlan = this._buildImportPlan(activeReport.config, localFiles);

		if (importPlan.overwriteMain === null && importPlan.overwriteTemplates.length === 0 && importPlan.createTemplates.length === 0 && importPlan.overwriteVariables === null) {
			this._notificationService.snackSuccess('No changes to import.');
			return;
		}

		const missingTemplateCount = Object.keys(activeReport.config.templates ?? {}).filter((id) => !importPlan.matchedTemplateIds.has(id)).length;
		const untouchedWarnings = [...(missingTemplateCount > 0 ? [`${missingTemplateCount} template(s) missing in folder will be kept in report.`] : []), ...importPlan.parseWarnings];

		const preview = {
			create: importPlan.createTemplates.map((x) => x.fileName),
			overwrite: [...(importPlan.overwriteMain ? [`main (${importPlan.overwriteMain.fileName})`] : []), ...importPlan.overwriteTemplates.map((x) => `${x.id} (${x.fileName})`), ...(importPlan.overwriteVariables ? [`report variables (${this._templateVariablesFileName})`] : [])],
		};

		const confirmed = await this._confirmSync('Import templates from local folder', this._buildPreviewMessage(preview, untouchedWarnings), 'Import');
		if (!confirmed) return;

		this._updateReportConfig(activeReport.id, (config) => {
			const nextTemplates: Record<string, TemplateData> = { ...(config.templates ?? {}) };

			for (const templateUpdate of importPlan.overwriteTemplates) {
				const existing = nextTemplates[templateUpdate.id];
				if (existing) {
					const meta = importPlan.templateMetaById[templateUpdate.id];
					nextTemplates[templateUpdate.id] = {
						...existing,
						key: meta?.key ?? existing.key,
						title: meta?.title ?? existing.title,
						content: templateUpdate.content,
					};
				}
			}

			for (const templateCreate of importPlan.createTemplates) {
				nextTemplates[templateCreate.id] = {
					key: templateCreate.key,
					title: templateCreate.title,
					content: templateCreate.content,
				};
			}

			return {
				...config,
				template: importPlan.overwriteMain ? importPlan.overwriteMain.content : config.template,
				templates: nextTemplates,
				data: importPlan.overwriteVariables ? importPlan.overwriteVariables.data : config.data,
			};
		});

		this._notificationService.snackSuccess('Templates imported from local folder.');
	}

	// This method was creating a mixed payload.
	// It seems "Download JSON" (browser) also used this.
	// "Download JSON" should consistent with "Save to Files" (Type: ReportConfig).
	public downloadReportJsonFile() {
		// const availableData = this.availableData(); // Unused if we only export config
		const activeReport = this.activeReport();
		if (!activeReport) {
			this._notificationService.error('Please select a report to export.');
			return;
		}

		// Requirement: "What is exported and import should always be typed to be a ReportConfig."
		// Previously: "Merge with availableData".
		// Now: Export only ReportConfig
		const reportConfig: ReportConfig = activeReport.config;

		const json = JSON.stringify(reportConfig, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `report-data-${activeReport.id}.json`;
		a.click();
		window.URL.revokeObjectURL(url);
	}

	private _applyImportedPayload(payload: ReportConfig) {
		const activeReport = this.activeReport();
		if (!activeReport) return;
		const reportId = activeReport.id;

		this._updateReportConfig(reportId, (config) => {
			return {
				...config,
				...payload,
				templates: { ...config.templates, ...payload.templates },
				data: { ...config.data, ...payload.data },
				pdfOptions: payload.pdfOptions || config.pdfOptions || this.defaultPdfOptions,
			};
		});

		this._notificationService.snackSuccess('Report updated from imported file.');
	}

	addReportConfig() {
		const configs = this.reportConfigs() ?? {};
		const reportIndex = Object.keys(configs).length + 1;
		const defaultTitle = `Report ${reportIndex}`;

		this._notificationService.prompt('Enter report name', 'New Report', { defaultValue: defaultTitle }).closed.subscribe((result) => {
			if (!result || !result.value) return;

			const reportId = uuidv4();
			const newConfigs = { ...configs };
			newConfigs[reportId] = {
				title: result.value,
				description: '',
				localSyncPath: '',
				template: '',
				templates: {},
				data: {},
				pdfOptions: { ...this.defaultPdfOptions },
			};

			this.reportConfigs.set(newConfigs);
			this.activeReportId.set(reportId);
		});
	}

	updatePdfOptions(reportId: string, optionsJson: string) {
		try {
			const pdfOptions = JSON.parse(optionsJson);
			this._updateReportConfig(reportId, (config) => ({ ...config, pdfOptions }));
		} catch (e) {
			// Ignore parse errors while typing
			console.warn('Invalid PDF options JSON', e);
		}
	}

	deleteReportConfig(reportId: string) {
		this._notificationService
			.confirm('Are you sure you want to delete this report?', 'Delete Report', {
				confirmButtonText: 'Delete',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				const configs = { ...this.reportConfigs() };
				delete configs[reportId];
				this.reportConfigs.set(configs);

				if (this.activeReportId() === reportId) {
					const remainingIds = Object.keys(configs);
					this.activeReportId.set(remainingIds.length ? remainingIds[0] : null);
				}
			});
	}

	updateReportTitle(reportId: string, title: string) {
		this._updateReportConfig(reportId, (config) => ({ ...config, title }));
	}

	updateReportDescription(reportId: string, description: string) {
		this._updateReportConfig(reportId, (config) => ({ ...config, description }));
	}

	updateReportLocalSyncPath(reportId: string, localSyncPath: string) {
		this._updateReportConfig(reportId, (config) => ({ ...config, localSyncPath }));
	}

	updateReportTemplate(reportId: string, template: string) {
		this._templateUpdate$.next({ reportId, template });
	}

	updateReportTemplatePart(reportId: string, id: string, content: string) {
		this._templatePartUpdate$.next({ reportId, id, content });
	}

	deleteTemplatePart(reportId: string, id: string) {
		this._notificationService
			.confirm('Are you sure you want to delete this sub template?', 'Delete sub template', {
				confirmButtonText: 'Delete',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				this._updateReportConfig(reportId, (config) => {
					const templates = { ...(config.templates ?? {}) };
					delete templates[id];
					return { ...config, templates };
				});
			});
	}

	promptEditTemplateTitle(reportId: string, id: string) {
		const template = this.reportConfigs()?.[reportId]?.templates?.[id];
		if (!template) return;
		this._notificationService.prompt('Template title', 'Edit template title', { defaultValue: template.title || '' }).closed.subscribe((result) => {
			const title = result?.value?.trim();
			if (!title) return;
			this._updateReportConfig(reportId, (config) => {
				const templates = { ...(config.templates ?? {}) };
				const current = templates[id];
				if (!current) return config;
				templates[id] = { ...current, title };
				return { ...config, templates };
			});
		});
	}

	promptEditTemplateKey(reportId: string, id: string) {
		const template = this.reportConfigs()?.[reportId]?.templates?.[id];
		if (!template) return;
		this._notificationService.prompt('Template key', 'Edit template key', { defaultValue: template.key || '' }).closed.subscribe((result) => {
			const key = result?.value?.trim();
			if (!key) return;
			if (this._isTemplateKeyTaken(reportId, key, id)) {
				this._notificationService.error(`Template key "${key}" is already used.`);
				return;
			}
			this._updateReportConfig(reportId, (config) => {
				const templates = { ...(config.templates ?? {}) };
				const current = templates[id];
				if (!current) return config;
				templates[id] = { ...current, key };
				return { ...config, templates };
			});
		});
	}

	public createNewSubTemplate(reportId: string, titleInput: HTMLInputElement, keyInput: HTMLInputElement, contentInput: HTMLTextAreaElement) {
		const title = titleInput.value.trim();
		const key = keyInput.value.trim();
		const content = contentInput.value.trim();

		if (!key) return;
		if (!content) return;
		if (this._isTemplateKeyTaken(reportId, key)) {
			this._notificationService.error(`Template key "${key}" is already used.`);
			return;
		}

		const templateId = uuidv4(); // Generate unique ID for the template part if needed

		this._updateReportConfig(reportId, (config) => {
			const templates: Record<string, TemplateData> = { ...(config.templates ?? {}) };
			templates[templateId] = { title, key, content };
			return { ...config, templates };
		});

		keyInput.value = '';
		contentInput.value = '';
	}

	updateReportVariableField(reportId: string, id: string, field: keyof ProjectBasicDataType, value: string) {
		this._variableFieldUpdate$.next({ reportId, id, field, value });
	}

	deleteReportVariable(reportId: string, key: string) {
		this._notificationService
			.confirm('Are you sure you want to delete this report variable?', 'Delete report variable', {
				confirmButtonText: 'Delete',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				this._updateReportConfig(reportId, (config) => {
					const data = { ...(config.data ?? {}) };
					delete data[key];
					return { ...config, data };
				});
			});
	}

	addReportVariable(reportId: string, keyInput: HTMLInputElement, titleInput: HTMLInputElement, kind: string | null, content: string | null) {
		const key = keyInput.value.trim();
		const title = titleInput.value.trim();
		// kind and content come now from signals or component values
		const kindValue = kind || 'text';
		const contentValue = content || '';

		if (!key) return;

		const variableId = uuidv4(); // Generate unique ID for the variable if needed

		this._updateReportConfig(reportId, (config) => {
			const data = { ...(config.data ?? {}) };
			data[variableId] = { title: title || key, key, kind: kindValue, content: contentValue };
			return { ...config, data };
		});

		keyInput.value = '';
		titleInput.value = '';
		// Reset signals
		this.newVariableKind.set('text');
		this.newVariableContent.set('');
	}

	private _updateReportConfig(reportId: string, transform: (config: ReportConfig) => ReportConfig) {
		const configs = { ...this.reportConfigs() };
		if (configs[reportId]) {
			configs[reportId] = transform(configs[reportId]);
			this.reportConfigs.set(configs);
		}
	}

	private _isTemplateKeyTaken(reportId: string, key: string, exceptTemplateId?: string): boolean {
		const templates = this.reportConfigs()?.[reportId]?.templates ?? {};
		return Object.entries(templates).some(([templateId, template]) => templateId !== exceptTemplateId && template.key === key);
	}

	onTextareaCursorActivity(event: Event, source: string) {
		const textarea = event.target as HTMLTextAreaElement;
		const text = textarea.value;
		const cursor = textarea.selectionStart;

		if (cursor === null || cursor === undefined) {
			this.currentWord.set(null);
			return;
		}

		// Look backward
		let start = cursor;
		while (start > 0 && this._isWordChar(text[start - 1])) {
			start--;
		}

		// Look forward
		let end = cursor;
		while (end < text.length && this._isWordChar(text[end])) {
			end++;
		}

		if (start === end) {
			this.currentWord.set(null);
		} else {
			const word = text.substring(start, end);
			this.currentWord.set({ word, source });
		}
	}

	public toggleTemplateExpansion(key: string) {
		const current = new Set(this.expandedTemplates());
		if (current.has(key)) {
			current.delete(key);
		} else {
			current.add(key);
		}
		this.expandedTemplates.set(current);
	}

	public toggleVariableExpansion(key: string) {
		const current = new Set(this.expandedVariables());
		if (current.has(key)) {
			current.delete(key);
		} else {
			current.add(key);
		}
		this.expandedVariables.set(current);
	}

	public isTemplateUsed(templateKey: string): boolean {
		return this.usedTemplateKeys().has(templateKey);
	}

	public isVariableUsed(variableKey: string): boolean {
		if (!variableKey) return false;
		return this.usedVariableKeys().has(variableKey);
	}

	private async _pickDirectoryHandle(mode: 'read' | 'readwrite'): Promise<FileSystemDirectoryHandle | null> {
		if (!('showDirectoryPicker' in window)) {
			this._notificationService.error('File system directory picker is not supported in this browser.');
			return null;
		}

		try {
			const showDirectoryPicker = window.showDirectoryPicker as (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
			return await showDirectoryPicker({ mode });
		} catch (error) {
			if ((error as DOMException)?.name !== 'AbortError') {
				console.error('Directory picker error', error);
				this._notificationService.error('Unable to access local folder.');
			}
			return null;
		}
	}

	private _buildFilesMapForExport(config: ReportConfig): Record<string, string> {
		const files: Record<string, string> = {};
		const manifest = this._buildManifest(config);
		files[this._templateManifestFileName] = this._stableStringify(manifest, 2);
		files[manifest.main.file] = (config.template ?? '').toString();

		const templates = config.templates ?? {};
		manifest.templates.forEach((entry) => {
			const templateData = templates[entry.id];
			files[entry.file] = (templateData?.content ?? '').toString();
		});
		files[this._templateVariablesFileName] = this._stableStringify(config.data ?? {}, 2);

		return files;
	}

	private async _readSyncFilesFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<Record<string, string>> {
		const files: Record<string, string> = {};
		const iterator = (directoryHandle as any).entries ? (directoryHandle as any).entries() : (directoryHandle as any).values();
		for await (const item of iterator as AsyncIterable<any>) {
			const entryHandle = Array.isArray(item) ? item[1] : item;
			const entryName = (Array.isArray(item) ? item[0] : entryHandle?.name) as string | undefined;
			if (!entryHandle || entryHandle.kind !== 'file' || !entryName) continue;
			const lowerName = entryName.toLowerCase();
			if (!lowerName.endsWith('.html') && lowerName !== this._templateVariablesFileName && lowerName !== this._templateManifestFileName) continue;
			const file = await (entryHandle as FileSystemFileHandle).getFile();
			files[entryName] = await file.text();
		}
		return files;
	}

	private _buildExportPreview(filesToWrite: Record<string, string>, existingHtmlFiles: Record<string, string>): { create: string[]; overwrite: string[] } {
		const create: string[] = [];
		const overwrite: string[] = [];

		Object.entries(filesToWrite).forEach(([name, content]) => {
			if (!(name in existingHtmlFiles)) {
				create.push(name);
				return;
			}
			if (existingHtmlFiles[name] !== content) {
				overwrite.push(name);
			}
		});

		return { create, overwrite };
	}

	private _buildImportPlan(
		config: ReportConfig,
		localFiles: Record<string, string>
	): {
		overwriteMain: { fileName: string; content: string } | null;
		overwriteTemplates: Array<{ id: string; fileName: string; content: string }>;
		createTemplates: Array<{ id: string; fileName: string; key: string; title: string; content: string }>;
		overwriteVariables: { data: Record<string, ProjectBasicDataType> } | null;
		parseWarnings: string[];
		matchedTemplateIds: Set<string>;
		templateMetaById: Record<string, { key: string; title: string }>;
	} {
		let overwriteMain: { fileName: string; content: string } | null = null;
		const overwriteTemplates: Array<{ id: string; fileName: string; content: string }> = [];
		const createTemplates: Array<{ id: string; fileName: string; key: string; title: string; content: string }> = [];
		let overwriteVariables: { data: Record<string, ProjectBasicDataType> } | null = null;
		const parseWarnings: string[] = [];
		const matchedTemplateIds = new Set<string>();
		const templateMetaById: Record<string, { key: string; title: string }> = {};

		const manifest = this._parseManifest(localFiles[this._templateManifestFileName] || '');
		if (!manifest) {
			parseWarnings.push(`${this._templateManifestFileName} is missing or invalid JSON. Template import is skipped.`);
		}

		const existingTemplates = config.templates ?? {};
		if (manifest) {
			const mainContent = localFiles[manifest.main.file];
			if (mainContent === undefined) {
				parseWarnings.push(`Main template file "${manifest.main.file}" is missing and will be ignored.`);
			} else if ((config.template ?? '') !== mainContent) {
				overwriteMain = { fileName: manifest.main.file, content: mainContent };
			}

			manifest.templates.forEach((manifestEntry) => {
				templateMetaById[manifestEntry.id] = {
					key: manifestEntry.key,
					title: manifestEntry.title,
				};
				const content = localFiles[manifestEntry.file];
				if (content === undefined) {
					parseWarnings.push(`Template file "${manifestEntry.file}" is missing for key "${manifestEntry.key}".`);
					return;
				}

				if (existingTemplates[manifestEntry.id]) {
					matchedTemplateIds.add(manifestEntry.id);
					const existing = existingTemplates[manifestEntry.id];
					const hasDiff = (existing.content ?? '').toString() !== content || (existing.key ?? '').toString() !== manifestEntry.key || (existing.title ?? '').toString() !== manifestEntry.title;
					if (hasDiff) {
						overwriteTemplates.push({ id: manifestEntry.id, fileName: manifestEntry.file, content });
					}
					return;
				}

				createTemplates.push({
					id: manifestEntry.id,
					fileName: manifestEntry.file,
					key: manifestEntry.key,
					title: manifestEntry.title,
					content,
				});
			});
		}

		const variablesContent = localFiles[this._templateVariablesFileName];
		if (variablesContent !== undefined) {
			try {
				const parsed = JSON.parse(variablesContent) as Record<string, ProjectBasicDataType>;
				if (this._stableStringify(parsed) !== this._stableStringify(config.data ?? {})) {
					overwriteVariables = { data: parsed ?? {} };
				}
			} catch {
				parseWarnings.push(`${this._templateVariablesFileName} is invalid JSON and will be ignored.`);
			}
		}

		return { overwriteMain, overwriteTemplates, createTemplates, overwriteVariables, parseWarnings, matchedTemplateIds, templateMetaById };
	}

	private _buildTemplateFileName(templateId: string, title: string): string {
		const safeTitle = this._toSafeFileName(title || 'template');
		return `${templateId}__${safeTitle}.html`;
	}

	private _buildManifest(config: ReportConfig): TemplateManifest {
		const templates = config.templates ?? {};
		const entries: TemplateManifestEntry[] = Object.entries(templates).map(([id, templateData]) => {
			const key = (templateData.key || this._toSafeKey(templateData.title || 'template')).toString();
			const title = (templateData.title || key).toString();
			return {
				id,
				key,
				title,
				file: this._buildTemplateFileName(id, key),
			};
		});

		return {
			main: {
				id: this._mainTemplateFileId,
				key: '__main__',
				title: 'Main template',
				file: `${this._mainTemplateFileId}__main.html`,
			},
			templates: entries,
		};
	}

	private _parseManifest(rawManifest: string): TemplateManifest | null {
		if (!rawManifest) return null;
		try {
			const parsed = JSON.parse(rawManifest) as TemplateManifest;
			if (!parsed?.main?.id || !parsed?.main?.file || !Array.isArray(parsed.templates)) return null;
			const validTemplates = parsed.templates.filter((entry) => Boolean(entry?.id && entry?.key && entry?.title && entry?.file));
			return {
				main: parsed.main,
				templates: validTemplates,
			};
		} catch {
			return null;
		}
	}

	private _toSafeFileName(value: string): string {
		return (value || 'template')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9]+/g, '_')
			.toLowerCase();
	}

	private _toSafeKey(value: string): string {
		const safe = this._toSafeFileName(value);
		return safe || 'template';
	}

	private _extractTemplateRefs(templateContent: string): Set<string> {
		const refs = new Set<string>();
		const regex = /@@([a-zA-Z0-9_]+)/g;
		let match: RegExpExecArray | null = regex.exec(templateContent);
		while (match) {
			if (match[1]) refs.add(match[1]);
			match = regex.exec(templateContent);
		}
		return refs;
	}

	private _extractJinjaIdentifiers(templateContent: string): Set<string> {
		const ids = new Set<string>();
		const blocks = templateContent.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? [];
		const ignore = new Set(['if', 'else', 'elif', 'endif', 'for', 'endfor', 'in', 'set', 'with', 'endwith', 'true', 'false', 'none', 'and', 'or', 'not']);

		blocks.forEach((block) => {
			const tokens = block.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
			tokens.forEach((token) => {
				if (!ignore.has(token)) ids.add(token);
			});
		});

		return ids;
	}

	private _stableStringify(value: unknown, space = 0): string {
		return JSON.stringify(this._sortObjectRecursively(value), null, space);
	}

	private _sortObjectRecursively(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => this._sortObjectRecursively(item));
		}
		if (value && typeof value === 'object') {
			const entries = Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, val]) => [key, this._sortObjectRecursively(val)]);
			return Object.fromEntries(entries);
		}
		return value;
	}

	private _buildPreviewMessage(preview: { create: string[]; overwrite: string[] }, warnings: string[], renames: Array<{ from: string; to: string }> = []): string {
		const lines: string[] = [];

		if (preview.overwrite.length > 0) {
			lines.push(`<b>Overwrite (${preview.overwrite.length})</b>`);
			lines.push(...preview.overwrite.map((item) => `• ${this._escapeHtml(item)}`));
		}
		if (preview.create.length > 0) {
			lines.push(`<b>Create (${preview.create.length})</b>`);
			lines.push(...preview.create.map((item) => `• ${this._escapeHtml(item)}`));
		}
		if (renames.length > 0) {
			lines.push(`<b>Rename (${renames.length})</b>`);
			lines.push(...renames.map((item) => `• ${this._escapeHtml(item.from)} -> ${this._escapeHtml(item.to)}`));
		}
		lines.push('<b>No template deletion will be performed in the report.</b>');
		lines.push(...warnings.map((warning) => this._escapeHtml(warning)));

		return lines.join('<br>');
	}

	private _escapeHtml(value: string): string {
		return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
	}

	private async _confirmSync(title: string, message: string, confirmButtonText: string): Promise<boolean> {
		return await new Promise<boolean>((resolve) => {
			this._notificationService.confirm(message, title, { confirmButtonText }).closed.subscribe((confirmed) => resolve(Boolean(confirmed)));
		});
	}

	private async _pickJsonFileContent(): Promise<string | null> {
		try {
			if ('showOpenFilePicker' in window) {
				const showOpenFilePicker = window.showOpenFilePicker as (options?: Record<string, unknown>) => Promise<FileSystemFileHandle[]>;
				const [handle] = await showOpenFilePicker({
					multiple: false,
					types: [{ description: 'JSON files', accept: { 'application/json': ['.json'] } }],
				});
				if (!handle) return null;
				const file = await handle.getFile();
				return await file.text();
			}
		} catch (error) {
			if ((error as DOMException)?.name === 'AbortError') return null;
			console.error('Error opening JSON file picker', error);
		}

		return await new Promise<string | null>((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json,application/json';
			input.onchange = async () => {
				const file = input.files?.[0];
				if (!file) {
					resolve(null);
					return;
				}
				resolve(await file.text());
			};
			input.click();
		});
	}

	private _isWordChar(char: string): boolean {
		// User definition: "between the previous space or line break and the next space, line break"
		// So we look for anything that is NOT a whitespace.
		return /\S/.test(char);
	}
}
