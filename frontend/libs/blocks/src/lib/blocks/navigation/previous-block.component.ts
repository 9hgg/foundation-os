import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MotherComponent } from '../../mother.component';
import { TwChevronLeftIcon } from '@foundation/icons';

@Component({
	selector: 'lib-previous-block',
	standalone: true,
	imports: [TwChevronLeftIcon],
	templateUrl: './previous-block.component.html',
	styleUrl: './previous-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviousBlockComponent extends MotherComponent {
	buttonText = signal('Previous');
	backgroundColor = signal('#4b5563'); // gray-600
	textColor = signal('#ffffff');
	borderRadius = signal(6);

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.buttonText);
		this.enlistSignalForBlockStorage(this.backgroundColor);
		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.borderRadius);
	}

	previous() {
		this.canvasManager?.goToPreviousCanvas();
	}
}
