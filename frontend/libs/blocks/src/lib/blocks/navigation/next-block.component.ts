import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MotherComponent } from '../../mother.component';
import { TwChevronRightIcon } from '@foundation/icons';

@Component({
	selector: 'lib-next-block',
	standalone: true,
	imports: [TwChevronRightIcon],
	templateUrl: './next-block.component.html',
	styleUrl: './next-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextBlockComponent extends MotherComponent {
	buttonText = signal('Next');
	backgroundColor = signal('#2563eb'); // blue-600
	textColor = signal('#ffffff');
	borderRadius = signal(6);

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.buttonText);
		this.enlistSignalForBlockStorage(this.backgroundColor);
		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.borderRadius);
	}

	next() {
		this.canvasManager?.goToNextCanvas();
	}
}
