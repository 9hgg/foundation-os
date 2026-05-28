import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { Router } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { Article } from '@foundation/articles/models';
import { ArticleTableComponent } from '@foundation/articles/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { McpAssistantConversationService } from './mcp-assistant-conversation.service';

@Component({
	selector: 'lib-mcp-assistant',
	imports: [TranslateDirective, ArticleTableComponent],
	templateUrl: './mcp-assistant.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'dashboard-page-host' },
})
export class McpAssistantComponent {
	private _router = inject(Router);
	private _mcpAssistantConversationService = inject(McpAssistantConversationService);
	public appConfigService = inject(AppConfigService);

	articles = model<(Article | null)[]>([]);

	public goToArticle(articleId: string) {
		this._router.navigateByUrl('/host/dashboard/assistant/' + articleId);
	}

	public createNewArticle() {
		this._mcpAssistantConversationService.createNewArticle();
	}
}
