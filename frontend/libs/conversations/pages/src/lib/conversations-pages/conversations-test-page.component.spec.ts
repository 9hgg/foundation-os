import { TestBed } from '@angular/core/testing';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { ConversationsTestPageComponent as ExportedFromIndex } from '../../index';
import { ConversationsTestPageComponent } from './conversations-test-page.component';

describe('ConversationsTestPageComponent', () => {
	it('is re-exported from the library entrypoint', () => {
		expect(ExportedFromIndex).toBe(ConversationsTestPageComponent);
	});

	it('creates the component with its injected repositories', async () => {
		await TestBed.configureTestingModule({
			imports: [ConversationsTestPageComponent],
			providers: [
				{ provide: ConversationsRepository, useValue: {} },
				{ provide: MessagesRepository, useValue: {} },
			],
		}).compileComponents();

		const fixture = TestBed.createComponent(ConversationsTestPageComponent);
		fixture.detectChanges();

		expect(fixture.componentInstance).toBeTruthy();
	});
});
