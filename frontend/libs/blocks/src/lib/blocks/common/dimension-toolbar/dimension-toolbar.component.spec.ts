import { TestBed } from '@angular/core/testing';
import { DimensionToolbarComponent } from './dimension-toolbar.component';

vi.mock('@foundation/canvas', () => ({
	CanvasManager: vi.fn(),
	convertToPixels: vi.fn((value: number, fromUnit: string) => {
		if (fromUnit === 'px') return value;
		if (fromUnit === '%') return value * 10; // 100% => 1000px for test
		return value;
	}),
	convertFromPixels: vi.fn((value: number, toUnit: string) => {
		if (toUnit === 'px') return value;
		if (toUnit === '%') return value / 10;
		return value;
	}),
	CssUnits: {},
}));

describe('DimensionToolbarComponent', () => {
	let component: DimensionToolbarComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [DimensionToolbarComponent],
		});
		const fixture = TestBed.createComponent(DimensionToolbarComponent);
		component = fixture.componentInstance;
		// Set the required input
		fixture.componentRef.setInput('canvasManager', {
			blocksDivContainer: { clientWidth: 1000, clientHeight: 800 },
		});
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('has default null dimension values', () => {
		expect(component.width()).toBeNull();
		expect(component.height()).toBeNull();
		expect(component.posX()).toBeNull();
		expect(component.posY()).toBeNull();
	});

	it('availableUnits includes expected units', () => {
		expect(component.availableUnits).toContain('px');
		expect(component.availableUnits).toContain('%');
		expect(component.availableUnits).toContain('em');
	});
});
