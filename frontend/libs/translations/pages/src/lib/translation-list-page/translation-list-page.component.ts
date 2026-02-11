import { TranslateDirective } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'lib-translation-list-page',
	standalone: true,
	imports: [TranslationTableComponent, TranslateDirective],
	templateUrl: './translation-list-page.component.html',
	styleUrl: './translation-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationListPageComponent {}
