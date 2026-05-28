import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectPresentationSlideCatalogEntry } from '@edf/edf-project-rands/models';
import { NotificationService } from '@foundation/notification';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { TranslationService } from '@foundation/translations/services';
import { isEqual } from '@foundation/utils';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-project-slides-tab',
	standalone: true,
	imports: [CommonModule, FormsModule, QuillTextareaComponent],
	templateUrl: './project-slides-tab.component.html',
	styleUrl: './project-slides-tab.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSlidesTabComponent {
	private _notificationService = inject(NotificationService);
	private _translationService = inject(TranslationService);
	private _i18n_deleteSlideTitle = this._translationService.prep('Supprimer le slide');
	private _i18n_deleteSlideConfirm = this._translationService.prep('Supprimer');
	private _i18n_deleteSlideMessage = this._translationService.prep('Voulez-vous vraiment supprimer ce slide du catalogue ?');

	slideCatalog = input<ProjectPresentationSlideCatalogEntry[]>([]);
	slideCatalogChange = output<ProjectPresentationSlideCatalogEntry[]>();

	selectedSlideId = signal<string | null>(null);

	selectedSlide = computed<ProjectPresentationSlideCatalogEntry | null>(() => {
		const slideCatalog = this.slideCatalog();
		const selectedSlideId = this.selectedSlideId();
		if (!selectedSlideId) return null;
		return slideCatalog.find((slide) => slide.id === selectedSlideId) ?? null;
	});

	selectedSlideLabel = computed(() => this.selectedSlide()?.label ?? '');
	selectedSlideTitle = computed(() => this.selectedSlide()?.title ?? '');
	selectedSlideSubtitle = computed(() => this.selectedSlide()?.subtitle ?? '');
	selectedSlideBodyHtml = computed(() => this.selectedSlide()?.bodyHtml ?? '');
	selectedSlideIncludeInToc = computed(() => this.selectedSlide()?.includeInToc ?? true);
	selectedSlideShowNumber = computed(() => this.selectedSlide()?.showNumber ?? true);

	selectSlide(slideId: string) {
		this.selectedSlideId.set(slideId);
	}

	addSlide() {
		const nextSlide: ProjectPresentationSlideCatalogEntry = {
			id: uuidv4(),
			label: 'Slide',
			title: 'Nouveau slide',
			subtitle: '',
			bodyHtml: '',
			bodyLines: [],
			includeInToc: true,
			showNumber: true,
		};
		this._commitSlideCatalog([...this.slideCatalog(), nextSlide]);
	}

	duplicateSelectedSlide() {
		const selectedSlide = this.selectedSlide();
		if (!selectedSlide) return;
		const duplicatedSlide: ProjectPresentationSlideCatalogEntry = {
			...this._cloneSlide(selectedSlide),
			id: uuidv4(),
			title: `${selectedSlide.title} (copie)`,
		};
		this._commitSlideCatalog([...this.slideCatalog(), duplicatedSlide]);
	}

	deleteSelectedSlide() {
		const selectedSlide = this.selectedSlide();
		if (!selectedSlide) return;
		this._notificationService
			.confirm(`${this._i18n_deleteSlideMessage()}\n\n${selectedSlide.title}`, this._i18n_deleteSlideTitle(), {
				confirmButtonText: this._i18n_deleteSlideConfirm(),
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				const nextSlideCatalog = this.slideCatalog().filter((slide) => slide.id !== selectedSlide.id);
				this._commitSlideCatalog(nextSlideCatalog);
			});
	}

	updateSelectedSlideLabel(label: string) {
		this._updateSelectedSlide((slide) => ({ ...slide, label }));
	}

	updateSelectedSlideTitle(title: string) {
		this._updateSelectedSlide((slide) => ({ ...slide, title }));
	}

	updateSelectedSlideSubtitle(subtitle: string) {
		this._updateSelectedSlide((slide) => ({ ...slide, subtitle }));
	}

	updateSelectedSlideBodyHtml(bodyHtml: string) {
		if (bodyHtml === (this.selectedSlide()?.bodyHtml ?? '')) return;
		this._updateSelectedSlide((slide) => ({ ...slide, bodyHtml }));
	}

	updateSelectedSlideIncludeInToc(includeInToc: boolean) {
		this._updateSelectedSlide((slide) => ({ ...slide, includeInToc }));
	}

	updateSelectedSlideShowNumber(showNumber: boolean) {
		this._updateSelectedSlide((slide) => ({ ...slide, showNumber }));
	}

	private _updateSelectedSlide(updater: (slide: ProjectPresentationSlideCatalogEntry) => ProjectPresentationSlideCatalogEntry) {
		const selectedSlide = this.selectedSlide();
		if (!selectedSlide) return;
		const updatedSlide = updater(selectedSlide);
		if (isEqual(updatedSlide, selectedSlide, true)) return;
		const nextSlideCatalog = this.slideCatalog().map((slide) => (slide.id === selectedSlide.id ? updater(this._cloneSlide(slide)) : this._cloneSlide(slide)));
		this._commitSlideCatalog(nextSlideCatalog, selectedSlide.id);
	}

	private _commitSlideCatalog(nextSlideCatalog: ProjectPresentationSlideCatalogEntry[], nextSelectedSlideId?: string | null) {
		const normalizedSlideCatalog = nextSlideCatalog.map((slide) => this._cloneSlide(slide));
		this.slideCatalogChange.emit(normalizedSlideCatalog);
		if (nextSelectedSlideId !== undefined) this.selectedSlideId.set(nextSelectedSlideId);
	}

	private _cloneSlide(slide: ProjectPresentationSlideCatalogEntry): ProjectPresentationSlideCatalogEntry {
		return {
			...slide,
			bodyHtml: slide.bodyHtml ?? '',
			bodyLines: [...(slide.bodyLines ?? [])],
		};
	}
}
