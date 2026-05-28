/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateDirective } from '@foundation/translations/services';

export interface FeedbackSelectionItem {
	slug: string;
	key: string;
	seenCount: number;
	answeredCount: number;
}

export interface FeedbackSelectionModalData {
	items: FeedbackSelectionItem[];
	selectedSlugs?: string[];
}

export interface FeedbackSelectionModalResult {
	selectedSlugs: string[];
}

@Component({
	selector: 'lib-feedback-selection-modal',
	imports: [FormsModule, TranslateDirective],
	templateUrl: './feedback-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackSelectionModalComponent {
	readonly searchTerm = signal('');
	readonly selectedSlugSet = signal<Record<string, true>>({});

	readonly filteredItems = computed(() => {
		const query = this.searchTerm().trim().toLowerCase();
		if (!query) {
			return this.feedbackSelectionModalData.items;
		}
		return this.feedbackSelectionModalData.items.filter((item) => item.slug.toLowerCase().includes(query) || item.key.toLowerCase().includes(query));
	});

	constructor(
		private _dialogRef: DialogRef<FeedbackSelectionModalResult, FeedbackSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public feedbackSelectionModalData: FeedbackSelectionModalData
	) {
		const initialSelectedSlugMap: Record<string, true> = {};
		for (const selectedSlug of feedbackSelectionModalData.selectedSlugs ?? []) {
			initialSelectedSlugMap[selectedSlug] = true;
		}
		this.selectedSlugSet.set(initialSelectedSlugMap);
	}

	isSelected(slug: string): boolean {
		return !!this.selectedSlugSet()[slug];
	}

	toggleSelection(slug: string): void {
		this.selectedSlugSet.update((currentSelectedSlugMap) => {
			if (currentSelectedSlugMap[slug]) {
				const { [slug]: _, ...remainingSelectedSlugMap } = currentSelectedSlugMap;
				return remainingSelectedSlugMap;
			}
			return {
				...currentSelectedSlugMap,
				[slug]: true,
			};
		});
	}

	selectAllFiltered(): void {
		const nextSelectionMap = { ...this.selectedSlugSet() };
		for (const feedbackSelectionItem of this.filteredItems()) {
			nextSelectionMap[feedbackSelectionItem.slug] = true;
		}
		this.selectedSlugSet.set(nextSelectionMap);
	}

	clearAll(): void {
		this.selectedSlugSet.set({});
	}

	save(): void {
		const selectedSlugs = Object.keys(this.selectedSlugSet());
		this._dialogRef.close({ selectedSlugs });
	}

	cancel(): void {
		this._dialogRef.close();
	}
}
