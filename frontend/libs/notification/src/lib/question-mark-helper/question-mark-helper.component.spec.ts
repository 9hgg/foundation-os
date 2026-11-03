import { TestBed } from '@angular/core/testing';
import { QuestionMarkHelpComponent } from './question-mark-helper.component';
import { NotificationService } from '../notification.service';

describe('QuestionMarkHelpComponent', () => {
	function mount() {
		const notify = vi.fn();
		TestBed.configureTestingModule({
			imports: [QuestionMarkHelpComponent],
			providers: [{ provide: NotificationService, useValue: { notify } }],
		});
		const fixture = TestBed.createComponent(QuestionMarkHelpComponent);
		fixture.componentRef.setInput('message', 'Explains the field');
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, notify };
	}

	it('notifies with the required message and an optional title when clicked', () => {
		const { fixture, notify } = mount();
		fixture.componentRef.setInput('title', 'Help');
		fixture.detectChanges();

		fixture.nativeElement.click();

		expect(notify).toHaveBeenCalledWith('Explains the field', 'Help');
	});

	it('notifies with an undefined title when none is provided', () => {
		const { fixture, notify } = mount();
		fixture.nativeElement.click();
		expect(notify).toHaveBeenCalledWith('Explains the field', undefined);
	});
});
