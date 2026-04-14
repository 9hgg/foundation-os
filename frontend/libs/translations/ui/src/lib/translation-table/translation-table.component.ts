/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { Translation } from '@foundation/translations/models';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { TranslationsRepository } from '@foundation/translations/state';
import { combineLatest, concatMap, finalize, forkJoin, map, of, range, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
@Component({
	selector: 'lib-translation-table',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule, FormsModule, CdkMenuModule, TranslateDirective, TranslatePipe],
	templateUrl: './translation-table.component.html',
	styleUrl: './translation-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationTableComponent extends RepositoryTableComponent<Translation, TranslationsRepository> {
	availableLanguages = ['en', 'fr', 'es', 'it', 'de', 'pt', 'ru', 'zh', 'ja'];
	isSelectingAll = signal(false);
	selectedTranslationsCount = signal(0);
	hasTranslations = signal(false);
	areAllTranslationsSelected = signal(false);

	constructor(
		private _repository: TranslationsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				pageSize: 100,
				orderingBy: { fieldName: 'time_created', direction: 'desc' },
				alwaysOnFilters: [],
				requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
					return _repository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, false, true);
				},
			},
			clickBehavior
		);

		combineLatest([this.itemsSelector.selectedItems$, this.paginator.totalNumberOfItems$$$.$])
			.pipe(takeUntilDestroyed())
			.subscribe(([selectedItems, totalNumberOfItems]) => {
				const selectedCount = selectedItems.length;
				const hasAtLeastOneTranslation = totalNumberOfItems > 0;
				this.selectedTranslationsCount.set(selectedCount);
				this.hasTranslations.set(hasAtLeastOneTranslation);
				this.areAllTranslationsSelected.set(hasAtLeastOneTranslation && selectedCount >= totalNumberOfItems);
			});
	}

	requestTranslation(translation: Translation) {
		const sentenceToTranslate = translation.sourceContent;
		const targetLang = translation.languageTarget;
		const context = translation.translationContext || undefined;

		this._translationService
			.requestTranslations$([
				{
					inputSentence: sentenceToTranslate,
					sentenceToTranslate: sentenceToTranslate,
					langCode: targetLang,
					inputLanguage: translation.languageSource || 'en',
					translationContext: context,
					rpbt: false,
				},
			])
			.subscribe(() => {
				this.paginator.refresh().subscribe();
			});
	}

	private _i18n_enterManualTranslation = this._translationService.prep('Enter translation');
	private _i18n_originalLanguage = this._translationService.prep('Original language');
	private _i18n_originalText = this._translationService.prep('Original text');
	private _i18n_context = this._translationService.prep('Context');

	private _escapeHtml(value: string) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	private _buildDuplicateTranslationMessage(translation: Translation) {
		const languageSource = this._escapeHtml((translation.languageSource || 'unknown').toUpperCase());
		const sourceContent = this._escapeHtml(translation.sourceContent || '-');
		const translationContext = this._escapeHtml(translation.translationContext || '-');

		return [
			`<strong>${this._escapeHtml(this._i18n_originalLanguage())}</strong>: ${languageSource}`,
			`<strong>${this._escapeHtml(this._i18n_originalText())}</strong><br><span class="block whitespace-pre-wrap">${sourceContent}</span>`,
			`<strong>${this._escapeHtml(this._i18n_context())}</strong><br><span class="block whitespace-pre-wrap">${translationContext}</span>`,
		].join('<br><br>');
	}

	duplicateTranslation(translation: Translation) {
		this._notificationService
			.prompt(this._buildDuplicateTranslationMessage(translation), this._i18n_enterManualTranslation(), {
				width: '560px',
				defaultValue: translation.translatedContent || '',
			})
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return of(null);
					const newContent = promptResult.value;

					const newTranslation: Translation = {
						...translation,
						id: uuidv4(),
						translator: 'manual',
						version: 'v1',
						translatedContent: newContent,
						timeCreated: undefined, // Let backend set it
						timeUpdated: undefined, // Let backend set it
					};

					return this._repository.postManualTranslation$(newTranslation);
				})
			)
			.subscribe(() => {
				this.paginator.refresh().subscribe();
			});
	}

	private _i18n_deleteTitle = this._translationService.prep('Delete Translation');
	private _i18n_deleteMessage = this._translationService.prep('Are you sure you want to delete this translation?');
	private _i18n_deleteSelectedTitle = this._translationService.prep('Delete selected translations');
	private _i18n_deleteSelectedMessage = this._translationService.prep('Are you sure you want to delete all selected translations?');

	toggleSelectAllTranslations() {
		if (this.isSelectingAll()) return;

		if (this.areAllTranslationsSelected()) {
			this.itemsSelector.unselectAll();
			return;
		}

		const totalNumberOfPages = this.paginator.totalNumberOfPages$$$.value;
		if (totalNumberOfPages === 0) return;

		const currentPageBeforeSelectAll = this.paginator.currentPage$$$.value;
		this.isSelectingAll.set(true);

		range(1, totalNumberOfPages)
			.pipe(
				concatMap((pageNumber) => this.paginator.requestPage$(pageNumber, undefined, true)),
				map((pageResult) => pageResult.data.filter((translation): translation is Translation => translation !== null)),
				finalize(() => {
					this.isSelectingAll.set(false);
					if (this.paginator.currentPage$$$.value !== currentPageBeforeSelectAll) {
						this.paginator.requestPage$(currentPageBeforeSelectAll, undefined, true).subscribe();
					}
				})
			)
			.subscribe((translationsOnPage) => {
				this.itemsSelector.selectMultiple(translationsOnPage);
			});
	}

	deleteTranslation(translation: Translation) {
		this._notificationService
			.confirm(this._i18n_deleteMessage(), this._i18n_deleteTitle())
			.closed.pipe(
				switchMap((confirmed) => {
					if (!confirmed) return of(null);
					if (!translation.id) return of(null);
					return this._repository.delete$(translation.id);
				})
			)
				.subscribe(() => {
					this.paginator.refresh().subscribe();
				});
	}

	deleteSelectedTranslations() {
		const selectedTranslationIds = this.itemsSelector.selectedItems
			.map((selectedTranslation) => selectedTranslation.id)
			.filter((selectedTranslationId): selectedTranslationId is string => !!selectedTranslationId);

		if (selectedTranslationIds.length === 0) return;

		this._notificationService
			.confirm(this._i18n_deleteSelectedMessage(), this._i18n_deleteSelectedTitle())
			.closed.pipe(
				switchMap((confirmed) => {
					if (!confirmed) return of(false);
					const deleteSelectedTranslationRequests = selectedTranslationIds.map((selectedTranslationId) =>
						this._repository.delete$(selectedTranslationId)
					);
					if (deleteSelectedTranslationRequests.length === 0) return of(false);
					return forkJoin(deleteSelectedTranslationRequests).pipe(map(() => true));
				})
			)
			.subscribe((hasDeletedSelectedTranslations) => {
				if (!hasDeletedSelectedTranslations) return;
				this.itemsSelector.unselectAll();
				this.paginator.refresh().subscribe();
			});
	}
}
