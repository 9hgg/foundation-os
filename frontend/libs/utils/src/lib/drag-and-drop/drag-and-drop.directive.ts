import { Directive, ElementRef, inject, OnDestroy, OnInit, OnChanges, TemplateRef, input, ViewContainerRef, EmbeddedViewRef } from '@angular/core';
import { DragAndDropService } from './drag-and-drop.service';

@Directive({
	selector: '[dragAndDropData]',
	standalone: true,
})
export class DragAndDropDirective implements OnInit, OnDestroy, OnChanges {
	private elementRef = inject(ElementRef<HTMLElement>);
	private dragAndDropService = inject(DragAndDropService);
	private viewContainerRef = inject(ViewContainerRef);

	dragAndDropData = input<any>();
	dragAndDropKind = input<string>('something');
	draggingEnabled = input<boolean>(false);
	dragPreviewTemplate = input<TemplateRef<any> | null>(null);

	private dragStartHandler = (event: DragEvent) => this._onDragStart(event);
	private dragEndHandler = (event: DragEvent) => this._onDragEnd(event);
	private touchStartHandler = (event: TouchEvent) => this._onTouchStart(event);
	private touchMoveHandler = (event: TouchEvent) => this.onTouchMove(event);
	private touchEndHandler = (event: TouchEvent) => this._onTouchEnd(event);

	private _lastTouchMoveEvent: TouchEvent | null = null;

	ngOnInit(): void {
		this._setupDragAndDrop();
	}

	ngOnDestroy(): void {
		this._removeDragAndDropListeners();
	}

	private _setupDragAndDrop(): void {
		const element = this.elementRef.nativeElement;

		if (this.draggingEnabled()) {
			// Make element draggable
			element.draggable = true;
			element.style.cursor = 'grab';

			// Add event listeners
			element.addEventListener('dragstart', this.dragStartHandler);
			element.addEventListener('dragend', this.dragEndHandler);

			// Touch events for mobile support
			element.addEventListener('touchstart', this.touchStartHandler, { passive: false });
			element.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
			element.addEventListener('touchend', this.touchEndHandler);
		} else {
			this._removeDragAndDropListeners();
			element.draggable = false;
			element.style.cursor = 'default';
		}
	}

	private _removeDragAndDropListeners(): void {
		const element = this.elementRef.nativeElement;

		element.removeEventListener('dragstart', this.dragStartHandler);
		element.removeEventListener('dragend', this.dragEndHandler);
		element.removeEventListener('touchstart', this.touchStartHandler);
		element.removeEventListener('touchmove', this.touchMoveHandler);
		element.removeEventListener('touchend', this.touchEndHandler);
	}

	private _onDragStart(event: DragEvent): void {
		console.log('Drag start with data:', this.dragAndDropData(), 'kind:', this.dragAndDropKind());

		// Set data in the service
		this.dragAndDropService.data = this.dragAndDropData();
		this.dragAndDropService.dataKind = this.dragAndDropKind();

		// Set drag effect
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', this.dragAndDropKind());

			// Set custom data
			if (this.dragAndDropData()) {
				event.dataTransfer.setData(
					'application/json',
					JSON.stringify({
						data: this.dragAndDropData(),
						kind: this.dragAndDropKind(),
					})
				);
			}

			// Set custom drag preview if template is provided
			this._(event.dataTransfer);
		}

		// Add visual feedback
		const element = event.currentTarget as HTMLElement;
		element.style.cursor = 'grabbing';
		element.classList.add('dragging');
	}

	private _onDragEnd(event: DragEvent | TouchEvent): void {
		console.log('Drag end');

		// Remove visual feedback
		const element = event.currentTarget as HTMLElement;
		element.style.cursor = 'grab';
		element.classList.remove('dragging');

		// // Clear data if drop was not successful
		// if (event.dataTransfer?.dropEffect === 'none') {
		// 	this.dragAndDropService.clear();
		// }

		// x and y depends on the event type
		const x = event instanceof DragEvent ? event.clientX : (this._lastTouchMoveEvent?.changedTouches[0].clientX ?? 0);
		const y = event instanceof DragEvent ? event.clientY : (this._lastTouchMoveEvent?.changedTouches[0].clientY ?? 0);

		this.dragAndDropService.drop(x, y);
	}

	private _onTouchStart(event: TouchEvent): void {
		console.log('Touch start with data:', this.dragAndDropData(), 'kind:', this.dragAndDropKind());

		// Set data in the service for touch events
		this.dragAndDropService.data = this.dragAndDropData();
		this.dragAndDropService.dataKind = this.dragAndDropKind();

		// Add visual feedback
		const element = event.currentTarget as HTMLElement;
		element.classList.add('dragging');

		// Prevent default to avoid scrolling
		event.preventDefault();
	}

	private onTouchMove(event: TouchEvent): void {
		this._lastTouchMoveEvent = event;

		// Update drag state in service
		const touch = event.touches[0];
		this.dragAndDropService.dragState$.next({
			x: touch.clientX,
			y: touch.clientY,
			operation: 'move',
		});

		// Prevent default to avoid scrolling
		event.preventDefault();
	}

	private _onTouchEnd(event: TouchEvent): void {
		console.log('Touch end');

		// Remove visual feedback
		const element = event.currentTarget as HTMLElement;
		element.classList.remove('dragging');

		if (this._lastTouchMoveEvent) {
			const touch = this._lastTouchMoveEvent.touches[0];

			// Find element under touch point
			const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
			console.log('Element under touch:', elementUnderTouch);

			// Update drag state for drop
			this.dragAndDropService.dragState$.next({
				x: touch.clientX,
				y: touch.clientY,
				operation: 'drop',
			});
		}

		this._lastTouchMoveEvent = null;
		this.dragAndDropService.clear();
	}

	private _(dataTransfer: DataTransfer): void {
		const template = this.dragPreviewTemplate();
		if (!template) {
			return;
		}

		try {
			// Create a view from the template
			const viewRef: EmbeddedViewRef<any> = this.viewContainerRef.createEmbeddedView(template, {
				$implicit: this.dragAndDropData(),
				data: this.dragAndDropData(),
				kind: this.dragAndDropKind(),
			});

			// Detect changes to render the view
			viewRef.detectChanges();

			// Create a container element for the preview
			const previewContainer = document.createElement('div');
			previewContainer.style.position = 'absolute';
			previewContainer.style.top = '-9999px';
			previewContainer.style.left = '-9999px';
			previewContainer.style.pointerEvents = 'none';
			previewContainer.style.transform = 'translate3d(0, 0, 0)'; // Force hardware acceleration

			// Append all root nodes from the view to the container
			viewRef.rootNodes.forEach((node) => {
				if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
					previewContainer.appendChild(node.cloneNode(true));
				}
			});

			// Temporarily add to document to calculate dimensions
			document.body.appendChild(previewContainer);

			// Set the drag image
			const rect = previewContainer.getBoundingClientRect();
			dataTransfer.setDragImage(previewContainer, rect.width / 2, rect.height / 2);

			// Clean up: remove the container after a short delay to ensure drag image is captured
			setTimeout(() => {
				if (previewContainer.parentNode) {
					document.body.removeChild(previewContainer);
				}
				// Destroy the view to prevent memory leaks
				viewRef.destroy();
			}, 0);
		} catch (error) {
			console.warn('Failed to create custom drag preview:', error);
		}
	}

	// Update drag and drop when inputs change
	ngOnChanges(): void {
		this._setupDragAndDrop();
	}
}
