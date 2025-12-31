import { TranslateDirective } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'lib-translation-list-page',
	standalone: true,
	imports: [CommonModule, TranslationTableComponent, TranslateDirective],
	templateUrl: './translation-list-page.component.html',
	styleUrl: './translation-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationListPageComponent {}
