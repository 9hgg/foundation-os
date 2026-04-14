import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { AbcdContainerBlockComponent, RootContainerBlockComponent } from './abcd-container-block.component';

vi.mock('uuid', () => ({
	v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(7)),
}));

// Polyfill ResizeObserver for jsdom
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as any;

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('AbcdContainerBlockComponent', () => {
	let component: AbcdContainerBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [AbcdContainerBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(AbcdContainerBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('initializes with 4 areas', () => {
		expect(component.areas().length).toBe(4);
	});

	it('has header area named A', () => {
		expect(component.headerArea()?.name).toBe('A');
	});

	it('has footer area named C', () => {
		expect(component.footerArea()?.name).toBe('C');
	});

	it('has 2 intermediary areas (B1, B2)', () => {
		const intermediaryAreas = component.intermediaryAreas();
		expect(intermediaryAreas.length).toBe(2);
		expect(intermediaryAreas[0].name).toBe('B1');
		expect(intermediaryAreas[1].name).toBe('B2');
	});

	describe('addIntermediaryArea', () => {
		it('adds a B3 area before footer', () => {
			component.addIntermediaryArea();
			expect(component.areas().length).toBe(5);
			expect(component.intermediaryAreas().length).toBe(3);
			// Footer should still be last
			const areas = component.areas();
			expect(areas[areas.length - 1].name).toBe('C');
		});
	});

	describe('removeIntermediaryArea', () => {
		it('removes an intermediary area', () => {
			const b1Id = component.intermediaryAreas()[0].id;
			component.removeIntermediaryArea(b1Id);
			expect(component.areas().length).toBe(3);
		});

		it('reindexes B areas after removal', () => {
			const b1Id = component.intermediaryAreas()[0].id;
			component.removeIntermediaryArea(b1Id);
			const remainingIntermediary = component.intermediaryAreas();
			expect(remainingIntermediary.length).toBe(1);
			expect(remainingIntermediary[0].name).toBe('B1');
		});

		it('preserves header and footer', () => {
			const b1Id = component.intermediaryAreas()[0].id;
			component.removeIntermediaryArea(b1Id);
			expect(component.headerArea()?.name).toBe('A');
			expect(component.footerArea()?.name).toBe('C');
		});
	});

	describe('updateAreaTargetBlock', () => {
		it('sets target block for an area', () => {
			const areaId = component.areas()[0].id;
			component.updateAreaTargetBlock(areaId, 'block-123');
			expect(component.areas().find((a) => a.id === areaId)?.targetBlockId).toBe('block-123');
		});

		it('sets target block to null', () => {
			const areaId = component.areas()[0].id;
			component.updateAreaTargetBlock(areaId, 'block-123');
			component.updateAreaTargetBlock(areaId, null);
			expect(component.areas().find((a) => a.id === areaId)?.targetBlockId).toBeNull();
		});
	});
});
