import { TestBed } from '@angular/core/testing';
import { NotificationBadgeComponent } from './notification-badge.component';
import { NotificationService } from '../notification.service';

describe('NotificationBadgeComponent', () => {
	function mount() {
		const notify = vi.fn();
		TestBed.configureTestingModule({
			imports: [NotificationBadgeComponent],
			providers: [{ provide: NotificationService, useValue: { notify } }],
		});
		const fixture = TestBed.createComponent(NotificationBadgeComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, notify };
	}

	it('defaults show to false and uses the fallback styling inputs', () => {
		const { component } = mount();
		expect(component.show()).toBe(false);
		expect(component.message()).toBe('');
		expect(component.title()).toBe('');
		expect(component.backgroundColor()).toBe('#ef4444');
		expect(component.textColor()).toBe('#ffffff');
		expect(component.size()).toBe('sm');
	});

	it('notifies with the configured message and title when clicked', () => {
		const { fixture, notify } = mount();
		fixture.componentRef.setInput('message', 'Something happened');
		fixture.componentRef.setInput('title', 'Heads up');
		fixture.detectChanges();

		fixture.nativeElement.click();

		expect(notify).toHaveBeenCalledWith('Something happened', 'Heads up');
	});

	it('does nothing on click when there is no message', () => {
		const { fixture, notify } = mount();
		fixture.nativeElement.click();
		expect(notify).not.toHaveBeenCalled();
	});
});
