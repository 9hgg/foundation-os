import { of } from 'rxjs';

import { SupportListPageComponent } from './support-list-page.component';

describe('support-list-page.component', () => {
	const buildComponent = () => {
		const notify = vi.fn();
		const createTicket$ = vi.fn((kind: string) => of({ id: 'article-1', kind }));
		const gateTicketCreation$ = vi.fn(() => of(true));
		const navigateByUrl = vi.fn();
		const component = Object.create(SupportListPageComponent.prototype) as SupportListPageComponent;

		component['_notificationService'] = { notify } as never;
		component['_supportService'] = { createTicket$ } as never;
		component['_rumbleGate'] = { gateTicketCreation$ } as never;
		component['_router'] = { navigateByUrl } as never;
		component.appConfigService = {
			config$_: { environment: { support: { email: 'support@example.test' } } },
		} as never;

		return { component, createTicket$, gateTicketCreation$, navigateByUrl, notify };
	};

	// What a ticket *is* now belongs to SupportService and is tested there; the page's job is
	// to ask for the right kind and go to what came back.
	it('opens a backlog request and navigates to it', () => {
		const { component, createTicket$, navigateByUrl } = buildComponent();

		component.createNewArticle('backlog');

		expect(createTicket$).toHaveBeenCalledWith('backlog');
		expect(navigateByUrl).toHaveBeenCalledWith('/host/dashboard/support/article-1');
	});

	it('opens a support request and navigates to it', () => {
		const { component, createTicket$, navigateByUrl } = buildComponent();

		component.createNewArticle('support');

		expect(createTicket$).toHaveBeenCalledWith('support');
		expect(navigateByUrl).toHaveBeenCalledWith('/host/dashboard/support/article-1');
	});

	it('navigates nowhere when the ticket could not be created', () => {
		const { component, createTicket$, navigateByUrl } = buildComponent();
		createTicket$.mockReturnValue(of(null));

		component.createNewArticle('support');

		expect(navigateByUrl).not.toHaveBeenCalled();
	});

	// TEMPORARY (Rumble Studio migration): delete with the gate itself.
	it('opens no ticket when the gate sent the person somewhere better', () => {
		const { component, createTicket$, gateTicketCreation$, navigateByUrl } = buildComponent();
		gateTicketCreation$.mockReturnValue(of(false));

		component.createNewArticle('support');

		expect(createTicket$).not.toHaveBeenCalled();
		expect(navigateByUrl).not.toHaveBeenCalled();
	});

	it('navigates to support destinations', () => {
		const { component, navigateByUrl } = buildComponent();

		component.goToArticle('article-1');
		component.goToKnowledgeBase();
		component.goToFaq();

		expect(navigateByUrl).toHaveBeenCalledWith('/host/dashboard/support/article-1');
		expect(navigateByUrl).toHaveBeenCalledWith('/support/articles');
		expect(navigateByUrl).toHaveBeenCalledWith('/faq');
	});

	it('copies the configured support email and notifies success', async () => {
		const { component, notify } = buildComponent();
		const writeText = vi.fn(() => Promise.resolve());
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});

		component.copyEmail();
		await Promise.resolve();

		expect(writeText).toHaveBeenCalledWith('support@example.test');
		expect(notify).toHaveBeenCalledWith('Email copied to clipboard!', 'success');
	});

	it('notifies when no support email is configured', () => {
		const { component, notify } = buildComponent();
		component.appConfigService = { config$_: { environment: { support: {} } } } as never;

		component.copyEmail();

		expect(notify).toHaveBeenCalledWith('Email not available', 'error');
	});
});