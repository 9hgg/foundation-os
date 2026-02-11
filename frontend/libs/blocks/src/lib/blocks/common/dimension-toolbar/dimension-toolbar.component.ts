import { CanvasManager, convertFromPixels, convertToPixels, CssUnits } from '@foundation/canvas';

import { Component, effect, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'lib-dimension-toolbar',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './dimension-toolbar.component.html',
	styleUrl: './dimension-toolbar.component.css',
})
export class DimensionToolbarComponent {
	// Model signals for two-way binding with parent
	width = model<number | null>(null);
	widthUnits = model<CssUnits>();
	height = model<number | null>(null);
	heightUnits = model<CssUnits>();
	posX = model<number | null>(null);
	posXUnits = model<CssUnits>();
	posY = model<number | null>(null);
	posYUnits = model<CssUnits>();

	// Canvas manager for getting canvas dimensions
	canvasManager = input.required<CanvasManager>();

	// Available CSS units
	availableUnits: CssUnits[] = ['px', 'em', 'rem', 'vw', 'vh', '%'];

	// Store previous units to detect changes
	private previousUnits: { [key: string]: CssUnits } = {};

	constructor() {
		// Listen for unit changes and convert values automatically
		effect(() => {
			this.handleUnitChange('width', this.widthUnits());
		});

		effect(() => {
			this.handleUnitChange('height', this.heightUnits());
		});

		effect(() => {
			this.handleUnitChange('posX', this.posXUnits());
		});

		effect(() => {
			this.handleUnitChange('posY', this.posYUnits());
		});
	}

	/**
	 * Handle unit changes and convert values to maintain visual consistency
	 */
	private handleUnitChange(property: 'width' | 'height' | 'posX' | 'posY', newUnit: CssUnits) {
		if (newUnit === undefined || newUnit === null) {
			return;
		}

		const currentValue = this[property]();
		if (currentValue === null) return;

		// Get the current unit by checking previous unit
		if (!this.previousUnits[property]) {
			// If no previous unit is set, initialize it with the current unit
			this.previousUnits[property] = newUnit;
		}
		const currentUnit = this.previousUnits[property];
		if (currentUnit === newUnit) return;

		// Convert the value from current unit to new unit
		const convertedValue = this.convertValue(currentValue, currentUnit, newUnit, property);

		// Update the value without triggering infinite loops
		this[property].set(convertedValue);

		// Store the new unit as the previous unit for next conversion
		this.previousUnits[property] = newUnit;
	}

	/**
	 * Convert a value from one CSS unit to another
	 */
	private convertValue(value: number, fromUnit: CssUnits, toUnit: CssUnits, property: 'width' | 'height' | 'posX' | 'posY'): number {
		if (fromUnit === toUnit) return value;

		// Get canvas dimensions for conversion calculations
		const canvasWidth = this.canvasManager().blocksDivContainer.clientWidth;
		const canvasHeight = this.canvasManager().blocksDivContainer.clientHeight;

		// Convert to pixels first as base unit
		let pixelValue = convertToPixels(value, fromUnit, canvasWidth, canvasHeight, property);

		// Convert from pixels to target unit
		return convertFromPixels(pixelValue, toUnit, canvasWidth, canvasHeight, property);
	}
}
