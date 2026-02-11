/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { Translation } from '@foundation/translations/models';
import { TranslateDirective } from '@foundation/translations/services';
import { TranslationsRepository } from '@foundation/translations/state';
import { of, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
@Component({
	selector: 'lib-translation-table',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule, FormsModule, CdkMenuModule, TranslateDirective],
	templateUrl: './translation-table.component.html',
	styleUrl: './translation-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationTableComponent extends RepositoryTableComponent<Translation, TranslationsRepository> {
	availableLanguages = ['en', 'fr', 'es', 'it', 'de', 'pt', 'ru', 'zh', 'ja'];

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
					translationContext: context,
					rpbt: false,
				},
			])
			.subscribe(() => {
				this.paginator.refresh().subscribe();
			});
	}

	private _i18n_enterManualTranslation = this._translationService.prep('Enter translation');
	duplicateTranslation(translation: Translation) {
		this._notificationService
			.prompt(undefined, this._i18n_enterManualTranslation(), {
				width: '300px',
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
}
