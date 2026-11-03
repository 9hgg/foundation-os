import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { McpAssistantComponent } from './mcp-assistant.component';
import { McpAssistantConversationService } from './mcp-assistant-conversation.service';

describe('McpAssistantComponent', () => {
	const router = { navigateByUrl: vi.fn() };
	const conversationService = { createNewArticle: vi.fn() };
	const appConfigService = {};

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				{ provide: Router, useValue: router },
				{ provide: McpAssistantConversationService, useValue: conversationService },
				{ provide: AppConfigService, useValue: appConfigService },
			],
		});
	});

	function build() {
		return TestBed.runInInjectionContext(() => new McpAssistantComponent());
	}

	it('starts with an empty article list', () => {
		const component = build();
		expect(component.articles()).toEqual([]);
	});

	it('exposes the injected app config service verbatim', () => {
		const component = build();
		expect(component.appConfigService).toBe(appConfigService);
	});

	it('navigates to the assistant conversation for a clicked article', () => {
		const component = build();
		component.goToArticle('article-42');
		expect(router.navigateByUrl).toHaveBeenCalledWith('/host/dashboard/assistant/article-42');
	});

	it('delegates new-article creation to the conversation service', () => {
		const component = build();
		component.createNewArticle();
		expect(conversationService.createNewArticle).toHaveBeenCalledWith();
	});
});
