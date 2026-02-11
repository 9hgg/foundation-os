import { ExportOption } from '@foundation/canvas';
import { QuillService } from '@foundation/quill/utils';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import Quill, { Delta } from 'quill';
import { combineLatest, filter, map, take, tap } from 'rxjs';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-paragraphe-request-block',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './paragraphe-request-block.component.html',
	styleUrl: './paragraphe-request-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParagrapheRequestBlockComponent extends MotherComponent implements OnDestroy {
	private _quillService = inject(QuillService);

	semanticHTML = signal('click to add your text');
	content = signal<Delta | null>(null);

	quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	quill: Quill | null = null;

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'string'> = {
			id: 'paragraphe-request-as-plain-text',
			kind: 'string',
			title: 'as Text',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the answer as plain text',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return '';
				const interviewId = ownerId;
				const propertyId = 'semanticHTML';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const HTMLvalue = interaction.config[propertyKey];
				const div = document.createElement('div');
				div.innerHTML = HTMLvalue;
				const text = div.innerText;
				if (!text) return '';
				if (text === 'undefined') return '';
				if (text === 'null') return '';
				return text;
			},
		};
		const b: ExportOption<'html'> = {
			id: 'paragraphe-request-as-html',
			kind: 'html',
			title: 'as HTML',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export the answer as HTML',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return '';
				const interviewId = ownerId;
				const propertyId = 'semanticHTML';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const HTMLvalue = interaction.config[propertyKey];
				if (!HTMLvalue) return '';
				return HTMLvalue;
			},
		};

		return [a, b];
	}

	constructor() {
		super();

		this.enlistSignalForInteractionStorage(this.semanticHTML);
		this.enlistSignalForInteractionStorage(this.content);

		// react to content and quillContainer to instanciate a Quill with first content

		combineLatest([this.interactionsLoaded$.pipe(map(() => this.content())), toObservable(this.quillContainer)])
			.pipe(
				filter(([, quillContainer]) => !!quillContainer),
				take(1),
				tap(([initialContent, qc]) => {
					if (!qc) {
						console.warn('Quill not loaded...');
						return;
					}
					// this.clearQuill();
					// this.loadQuill(qc.nativeElement, initialContent);

					if (this.quill) {
						this._quillService.clearQuill(this.quill);
						this.quill = null;
					}
					this._quillService.loadQuill(null, initialContent, qc.nativeElement, (quillTextDetails) => {
						this.semanticHTML.set(quillTextDetails.semanticHTML);
						this.content.set(quillTextDetails.content);
					});
				})
			)
			.subscribe();
	}

	override destructor() {
		this.quill ? this._quillService.clearQuill(this.quill) : null;
	}
}
