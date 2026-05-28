import { ArticleDisplayerComponent } from './article-displayer.component';

describe('article-displayer.component', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		window.history.pushState({}, '', window.location.pathname);
	});

	it('scrolls to and highlights a message fragment after view init', () => {
		vi.useFakeTimers();
		window.history.pushState({}, '', '#message-1');
		const add = vi.fn();
		const scrollIntoView = vi.fn();
		const element = {
			classList: { add },
			scrollIntoView,
		};
		vi.spyOn(document, 'querySelector').mockReturnValue(element as never);
		const component = Object.create(ArticleDisplayerComponent.prototype) as ArticleDisplayerComponent;

		component.ngAfterViewInit();
		vi.advanceTimersByTime(300);

		expect(document.querySelector).toHaveBeenCalledWith('#message-1');
		expect(add).toHaveBeenCalledWith('highlight-and-fade');
		expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
	});

	it('does nothing when there is no message fragment', () => {
		window.history.pushState({}, '', '#other');
		const querySelector = vi.spyOn(document, 'querySelector');
		const component = Object.create(ArticleDisplayerComponent.prototype) as ArticleDisplayerComponent;

		component.ngAfterViewInit();

		expect(querySelector).not.toHaveBeenCalled();
	});
});
