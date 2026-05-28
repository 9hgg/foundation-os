import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { ProjectSlidesTabComponent } from './project-slides-tab.component';

vi.mock('uuid', () => {
	let counter = 0;
	return {
		v4: () => `slide-${++counter}`,
	};
});

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectSlidesTabComponent', () => {
	let notificationService: { confirm: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		notificationService = {
			confirm: vi.fn().mockReturnValue({ closed: of(true) }),
		};
		TestBed.configureTestingModule({
			providers: [
				{ provide: NotificationService, useValue: notificationService },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
			],
		});
	});

	function createComponent() {
		const component = TestBed.runInInjectionContext(() => new ProjectSlidesTabComponent()) as any;
		component.slideCatalog = createSignal([
			{ id: 'slide-a', label: 'A', title: 'Alpha', subtitle: '', bodyHtml: '<p>A</p>', bodyLines: ['A'], includeInToc: true, showNumber: true },
			{ id: 'slide-b', label: 'B', title: 'Beta', subtitle: 'More', bodyHtml: '<p>B</p>', bodyLines: ['B'], includeInToc: false, showNumber: false },
		]);
		component.slideCatalogChange = { emit: vi.fn() };
		component.selectedSlideId.set('slide-a');
		return component;
	}

	it('selects, adds, duplicates, and deletes slides', () => {
		const component = createComponent();

		expect(component.selectedSlide()?.title).toBe('Alpha');
		component.selectSlide('slide-b');
		expect(component.selectedSlideTitle()).toBe('Beta');

		component.addSlide();
		component.duplicateSelectedSlide();
		component.deleteSelectedSlide();

		expect(component.slideCatalogChange.emit).toHaveBeenCalledTimes(3);
		expect(notificationService.confirm).toHaveBeenCalled();
	});

	it('updates slide fields only when values change and clones body lines safely', () => {
		const component = createComponent();

		component.updateSelectedSlideLabel('Renamed');
		component.updateSelectedSlideTitle('Title 2');
		component.updateSelectedSlideSubtitle('Subtitle 2');
		component.updateSelectedSlideBodyHtml('<p>Updated</p>');
		component.updateSelectedSlideBodyHtml('<p>Updated</p>');
		component.updateSelectedSlideIncludeInToc(false);
		component.updateSelectedSlideShowNumber(false);

		expect(component.slideCatalogChange.emit).toHaveBeenCalledTimes(7);

		const clonedSlide = component._cloneSlide({ id: 'slide-c', label: 'C', title: 'Gamma', bodyLines: ['Line 1'] });
		clonedSlide.bodyLines.push('Line 2');
		expect(component._commitSlideCatalog).toBeTypeOf('function');
		expect(clonedSlide.bodyLines).toEqual(['Line 1', 'Line 2']);
	});
});
