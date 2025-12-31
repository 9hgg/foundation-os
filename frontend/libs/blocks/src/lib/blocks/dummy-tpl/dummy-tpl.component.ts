import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MotherComponent } from '../../mother.component';

@Component({
	selector: 'lib-dummy-tpl',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './dummy-tpl.component.html',
	styleUrl: './dummy-tpl.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DummyTplComponent extends MotherComponent {
	counter = signal(0);

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.counter);
	}

	increment() {
		this.counter.set(this.counter() + 1);
	}
}
