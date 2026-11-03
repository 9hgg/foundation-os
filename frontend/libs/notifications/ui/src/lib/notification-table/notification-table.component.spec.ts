import { of } from 'rxjs';
import { NotificationTableComponent } from './notification-table.component';

const EXCLUDE_ARCHIVED_FILTER = { fieldName: 'archived', value: '~true', matchType: 'exact', comparison: '<>' };

describe('NotificationTableComponent', () => {
	const notification = { id: 'notification-1', read: false, kind: 'comment', targetId: 'article-1', config: { messageId: 'message-1' } };

	const buildComponent = (alwaysOnFilters: unknown[] = [EXCLUDE_ARCHIVED_FILTER]) => {
		const post$ = vi.fn(() => of({ result: {} }));
		const refresh = vi.fn(() => of(null));
		const setAlwaysOnFilters = vi.fn();
		const goToArticle = vi.fn();

		const component = Object.create(NotificationTableComponent.prototype) as NotificationTableComponent;
		component['_requestService'] = { post$ } as never;
		component['_articlesRepository'] = { goToArticle } as never;
		component.paginator = { refresh, setAlwaysOnFilters, _alwaysOnFilters$$$: { value: alwaysOnFilters } } as never;

		return { component, post$, refresh, setAlwaysOnFilters, goToArticle };
	};

	it('toggles the read flag on the backend and refreshes the list', () => {
		const { component, post$, refresh } = buildComponent();

		component.toggleRead(notification as never);

		expect(post$).toHaveBeenCalledWith('/api/notifications/notification-1/read/toggle', {});
		expect(refresh).toHaveBeenCalled();
	});

	it('toggles the archived flag on the backend and refreshes the list', () => {
		const { component, post$, refresh } = buildComponent();

		component.toggleArchived(notification as never);

		expect(post$).toHaveBeenCalledWith('/api/notifications/notification-1/archived/toggle', {});
		expect(refresh).toHaveBeenCalled();
	});

	it('marks everything read and refreshes the list', () => {
		const { component, post$, refresh } = buildComponent();

		component.markAllAsRead();

		expect(post$).toHaveBeenCalledWith('/api/notifications/read/all', {});
		expect(refresh).toHaveBeenCalled();
	});

	it('drops the archived filter to show archived notifications too', () => {
		const { component, setAlwaysOnFilters } = buildComponent();

		component.toggleDisplayAllArchived();

		expect(setAlwaysOnFilters).toHaveBeenCalledWith([]);
	});

	it('puts the archived filter back to hide them again', () => {
		const { component, setAlwaysOnFilters } = buildComponent([]);

		component.toggleDisplayAllArchived();

		expect(setAlwaysOnFilters).toHaveBeenCalledWith([EXCLUDE_ARCHIVED_FILTER]);
	});

	describe('opening a notification', () => {
		it('marks an unread one read on the way', () => {
			const { component, post$ } = buildComponent();

			component.customFunction(notification as never);

			expect(post$).toHaveBeenCalledWith('/api/notifications/notification-1/read/toggle', {});
		});

		it('leaves an already-read one alone', () => {
			const { component, post$ } = buildComponent();

			component.customFunction({ ...notification, read: true } as never);

			expect(post$).not.toHaveBeenCalled();
		});

		it('goes to the article and the message a comment, reaction, mention or reply points at', () => {
			for (const kind of ['comment', 'reaction', 'mention', 'reply']) {
				const { component, goToArticle } = buildComponent();

				component.customFunction({ ...notification, kind, read: true } as never);

				expect(goToArticle).toHaveBeenCalledWith('article-1', { messageId: 'message-1' });
			}
		});

		// Neither carries a message: the article itself is the destination.
		it.each(['ticket', 'feature_request'])('goes to the article a %s notification points at', (kind) => {
			const { component, goToArticle } = buildComponent();

			component.customFunction({ ...notification, kind, config: { userId: 'user-1' }, read: true } as never);

			expect(goToArticle).toHaveBeenCalledWith('article-1');
		});

		it('does nothing for a kind it has no destination for', () => {
			const { component, goToArticle } = buildComponent();

			component.customFunction({ ...notification, kind: 'something-else', read: true } as never);

			expect(goToArticle).not.toHaveBeenCalled();
		});
	});
});
