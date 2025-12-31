import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { MotherComponent } from '../../mother.component';
import { TwChevronRightIcon, TwChevronLeftIcon, TwChevronDoubleLeftIcon, TwNavigationIcon } from '@foundation/icons';

@Component({
	selector: 'lib-goto-block',
	standalone: true,
	imports: [TwChevronRightIcon, TwChevronLeftIcon, TwChevronDoubleLeftIcon, TwNavigationIcon],
	templateUrl: './goto-block.component.html',
	styleUrl: './goto-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoToBlockComponent extends MotherComponent {
	@Input() targetCanvasId: string = '';

	targetType = signal<'next' | 'prev' | 'custom' | 'beginning'>('next');
	customTarget = signal('');
	buttonText = signal('Navigate');
	backgroundColor = signal('#4f46e5'); // indigo-600
	textColor = signal('#ffffff');
	borderRadius = signal(6);

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.targetType);
		this.enlistSignalForBlockStorage(this.customTarget);
		this.enlistSignalForBlockStorage(this.buttonText);
		this.enlistSignalForBlockStorage(this.backgroundColor);
		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.borderRadius);
		// Note: targetCanvasId is @Input and will be handled differently
	}

	goToTarget() {
		if (!this.canvasManager) return;

		switch (this.targetType()) {
			case 'next':
				this.canvasManager.goToNextCanvas();
				break;
			case 'prev':
				this.canvasManager.goToPreviousCanvas();
				break;
			case 'beginning':
				// Go to the first canvas
				const canvases = this.canvasManager.canvasesAsArray;
				if (canvases.length > 0) {
					this.canvasManager.selectCanvasById(canvases[0].id);
				}
				break;
			case 'custom':
				const targetId = this.customTarget() || this.targetCanvasId;
				if (targetId) {
					this.canvasManager.selectCanvasById(targetId);
				}
				break;
			default:
				console.warn('Unknown target type:', this.targetType());
		}
	}

	getButtonText(): string {
		switch (this.targetType()) {
			case 'next':
				return 'Next';
			case 'prev':
				return 'Previous';
			case 'beginning':
				return 'Go to Beginning';
			case 'custom':
				const targetId = this.customTarget() || this.targetCanvasId;
				return targetId ? `Go to ${targetId}` : 'Go to Page';
			default:
				return 'Navigate';
		}
	}
}
