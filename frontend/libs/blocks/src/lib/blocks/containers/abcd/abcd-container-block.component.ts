import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, delay, Subject, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Area, MotherComponent } from '../../../mother.component';
import { DimensionToolbarComponent } from '../../common/dimension-toolbar/dimension-toolbar.component';

@Component({
	selector: 'lib-root-container-block',
	standalone: true,
	imports: [CommonModule, CdkMenuModule, FormsModule],
	template: '',
})
export class RootContainerBlockComponent extends MotherComponent {
	private _areaElements = viewChildren<ElementRef<HTMLElement>>('interactionArea');
	private _elementRef = inject(ElementRef);
	private _observedElements = new Set<HTMLElement>();
	private _resizeObserver = new ResizeObserver((entries) => {
		this._updateAreaObservation();
	});
	private _mutationObserver = new MutationObserver((mutations) => {
		this._updateAreaObservation();
	});

	availableBlocks = computed(() => {
		this.canvasManager?.currentCanvasId;
		if (!this.canvasManager?.currentCanvasId) return [];
		const currentCanvas = this.canvasManager.getCopyOfCurrentCanvas();
		if (!currentCanvas) return [];
		return Object.values(currentCanvas.blocks).filter((block) => block.id !== this.blockId);
	});

	areas = signal<Area[]>([]);

	constructor() {
		super();

		// Start observing mutations on the component's root element
		this._mutationObserver.observe(this._elementRef.nativeElement, {
			childList: true,
			subtree: true,
			// attributes: true,
			// attributeFilter: ['class', 'id'],
		});

		this._updateAreaObservationBouncer$
			.pipe(
				takeUntilDestroyed(),
				tap(() => {
					this.__updateAreaObservation();
				}),
				debounceTime(300),
				tap(() => {
					this.__processAreas();
				})
			)
			.subscribe();

		this.block$_.$.pipe(
			takeUntilDestroyed(),
			// debounceTime(300),
			tap(() => {
				// not debounce to keep blocks moving with the container
				this.__processAreas();
			}),
			delay(100), // Delay to ensure DOM is updated after block data changes
			tap(() => {
				this.__processAreas();
				// this.canvasManager?.updateCurrentCanvasInDom('abcd-container-block'); // Update the canvas in DOM
			})
		).subscribe();
	}

	_updateAreaObservationBouncer$ = new Subject<void>();
	private _updateAreaObservation() {
		this._updateAreaObservationBouncer$.next();
	}

	private __updateAreaObservation() {
		const areas = this._areaElements();
		const passive = this.passive();
		if (passive) return;

		// Get current area elements
		const currentAreaElements = new Set(areas.map((area) => area.nativeElement));

		// Unobserve elements that are no longer in the current areas list
		this._observedElements.forEach((element) => {
			if (!currentAreaElements.has(element)) {
				this._resizeObserver.unobserve(element);
				element.classList.remove('observed');
				this._observedElements.delete(element);
				// console.log('[AbcdContainerBlockComponent] Unobserved removed area', element);
			}
		});

		// Observe new areas
		areas.forEach((area) => {
			if (!this._observedElements.has(area.nativeElement)) {
				this._resizeObserver.observe(area.nativeElement);
				area.nativeElement.classList.add('observed');
				this._observedElements.add(area.nativeElement);
				// console.log('[AbcdContainerBlockComponent] Observing new area', area.nativeElement);
			}
		});
	}

	private __processAreas() {
		const passive = this.passive();
		if (passive) return;
		const areaElements = this._areaElements();
		if (areaElements.length === 0) return;
		const canvasManager = this.canvasManager;
		if (!canvasManager) return;
		const currentCanvas = canvasManager.getCopyOfCurrentCanvas();
		if (!currentCanvas) return;

		// console.log('[AbcdContainerBlockComponent] - areas', areaElements);

		// Log size of each area
		areaElements.forEach((area) => {
			const matchingArea = this.areas().find((a) => a.id === area.nativeElement.getAttribute('data-area-id'));
			if (!matchingArea) return;
			if (!matchingArea.targetBlockId) return;
			const rect = area.nativeElement.getBoundingClientRect();
			const block = canvasManager.getCopyOfBlockById(currentCanvas.id, matchingArea.targetBlockId);
			if (!block) return;
			const { pos_x, pos_y } = canvasManager.convertDOMCoordinatesToCanvasCoordinates(rect.left, rect.top);
			const { pos_x: pos_x_2, pos_y: pos_y_2 } = canvasManager.convertDOMCoordinatesToCanvasCoordinates(rect.right, rect.bottom);
			const w = Math.round(pos_x_2 - pos_x);
			const h = Math.round(pos_y_2 - pos_y);
			canvasManager.setBlock(currentCanvas.id, block.id, {
				...block,
				posX: Math.round(pos_x),
				posY: Math.round(pos_y),
				width: w,
				height: h,
			});
		});
	}

	updateAreaTargetBlock(areaId: string, targetBlockId: string | null) {
		const currentAreas = this.areas();
		const updatedAreas = currentAreas.map((area) => (area.id === areaId ? { ...area, targetBlockId } : area));
		this.areas.set(updatedAreas);
	}

	/**
	 * Returns the list of areas that intersect with the given x,y coordinates
	 * @param x - X coordinate (screen/viewport coordinates)
	 * @param y - Y coordinate (screen/viewport coordinates)
	 * @returns Array of areas that intersect with the coordinates
	 */
	public getIntersectingAreas(x: number, y: number, onlyOne: boolean = true): { area: Area; rect: DOMRect }[] {
		const areaElements = this._areaElements();
		const intersectingAreas: { area: Area; rect: DOMRect }[] = [];

		for (const areaElement of areaElements) {
			const rect = areaElement.nativeElement.getBoundingClientRect();
			const areaId = areaElement.nativeElement.getAttribute('data-area-id');

			// Check if coordinates are within the area bounds
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				// Find the matching area from the areas signal
				const matchingArea = this.areas().find((area) => area.id === areaId);
				if (matchingArea) {
					intersectingAreas.push({
						rect,
						area: matchingArea,
					});
					if (onlyOne) {
						return intersectingAreas;
					}
				}
			}
		}

		return intersectingAreas;
	}

	override destructor() {
		console.log('[AbcdContainerBlockComponent] Destructor called, cleaning up observers and elements.');

		// Clean up observers
		this._resizeObserver.disconnect();
		this._mutationObserver.disconnect();
		this._observedElements.clear();
	}
}

@Component({
	selector: 'lib-abcd-container-block',
	standalone: true,
	imports: [CommonModule, CdkMenuModule, FormsModule, DimensionToolbarComponent],
	templateUrl: './abcd-container-block.component.html',
	styleUrl: './abcd-container-block.component.css',
})
export class AbcdContainerBlockComponent extends RootContainerBlockComponent {
	// computed properties
	headerArea = computed(() => this.areas().find((area) => area.name === 'A') || null);
	footerArea = computed(() => this.areas().find((area) => area.name === 'C') || null);
	intermediaryAreas = computed(() => this.areas().filter((area) => area.name.startsWith('B')));

	constructor() {
		super();
		this.areas.set([
			{ id: uuidv4(), name: 'A', targetBlockId: null }, // Header
			{ id: uuidv4(), name: 'B1', targetBlockId: null }, // First intermediary
			{ id: uuidv4(), name: 'B2', targetBlockId: null }, // Second intermediary
			{ id: uuidv4(), name: 'C', targetBlockId: null }, // Footer
		]);
		this.enlistSignalForBlockStorage(this.areas);
	}

	// Area management methods
	addIntermediaryArea() {
		const currentAreas = this.areas();
		const intermediaryAreas = this.intermediaryAreas();
		const nextIndex = intermediaryAreas.length + 1;
		const newArea: Area = {
			id: uuidv4(),
			name: `B${nextIndex}`,
			targetBlockId: null,
		};

		// Insert before the footer area (C)
		const footerIndex = currentAreas.findIndex((area) => area.name === 'C');
		const newAreas = [...currentAreas];
		newAreas.splice(footerIndex, 0, newArea);

		this.areas.set(newAreas);
	}

	removeIntermediaryArea(areaId: string) {
		const currentAreas = this.areas();
		const filteredAreas = currentAreas.filter((area) => area.id !== areaId);

		// Reorder B areas to maintain sequence
		const headerArea = filteredAreas.find((area) => area.name === 'A');
		const footerArea = filteredAreas.find((area) => area.name === 'C');
		const intermediaryAreas = filteredAreas.filter((area) => area.name.startsWith('B'));

		// Rename intermediary areas to maintain sequence
		const reorderedAreas = [
			headerArea!,
			...intermediaryAreas.map((area, index) => ({
				...area,
				name: `B${index + 1}`,
			})),
			footerArea!,
		];

		this.areas.set(reorderedAreas);
	}
}
