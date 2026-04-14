import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { StarRatingBlockComponent } from './star-rating-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('StarRatingBlockComponent', () => {
	let component: StarRatingBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [StarRatingBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(StarRatingBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.rating()).toBe(0);
		expect(component.hoverRating()).toBe(0);
		expect(component.label()).toBe('Rate your experience');
		expect(component.maxStars()).toBe(5);
	});

	describe('onStarClick', () => {
		it('sets rating when not in edit mode', () => {
			component.onStarClick(3);
			expect(component.rating()).toBe(3);
		});

		it('does not set rating in edit mode', () => {
			component.canvasManager = { editorMode: 'edit' } as any;
			component.onStarClick(3);
			expect(component.rating()).toBe(0);
		});
	});

	describe('onStarHover / onStarLeave', () => {
		it('sets hoverRating on hover', () => {
			component.onStarHover(4);
			expect(component.hoverRating()).toBe(4);
		});

		it('resets hoverRating on leave', () => {
			component.onStarHover(4);
			component.onStarLeave();
			expect(component.hoverRating()).toBe(0);
		});

		it('does not change hoverRating in edit mode', () => {
			component.canvasManager = { editorMode: 'edit' } as any;
			component.onStarHover(4);
			expect(component.hoverRating()).toBe(0);
		});
	});

	describe('getStarArray', () => {
		it('returns array of 5 elements by default', () => {
			expect(component.getStarArray()).toEqual([1, 2, 3, 4, 5]);
		});

		it('reflects maxStars changes', () => {
			component.maxStars.set(3);
			expect(component.getStarArray()).toEqual([1, 2, 3]);
		});
	});

	describe('isStarFilled', () => {
		it('returns true for stars <= rating', () => {
			component.rating.set(3);
			expect(component.isStarFilled(1)).toBe(true);
			expect(component.isStarFilled(3)).toBe(true);
			expect(component.isStarFilled(4)).toBe(false);
		});

		it('uses hoverRating over rating when set', () => {
			component.rating.set(2);
			component.hoverRating.set(4);
			expect(component.isStarFilled(3)).toBe(true);
			expect(component.isStarFilled(5)).toBe(false);
		});
	});

	describe('getRatingText', () => {
		it('returns empty string for 0 rating', () => {
			expect(component.getRatingText()).toBe('');
		});

		it('returns "3 out of 5 stars" for rating 3', () => {
			component.rating.set(3);
			expect(component.getRatingText()).toBe('3 out of 5 stars');
		});
	});

	describe('export options', () => {
		it('returns 3 export options', () => {
			const opts = StarRatingBlockComponent.getExportOptions();
			expect(opts.length).toBe(3);
			expect(opts.map((o) => o.id)).toEqual(['star-rating-as-number', 'star-rating-as-text', 'star-rating-as-stars']);
		});

		it('star-rating-as-number returns 0 for null interaction', () => {
			const opt = StarRatingBlockComponent.getExportOptions()[0];
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1')).toBe(0);
		});

		it('star-rating-as-stars returns filled/empty stars', () => {
			const opt = StarRatingBlockComponent.getExportOptions()[2];
			const interaction = { config: { 'o1.s1.b1.rating': 3, 'o1.s1.b1.maxStars': 5 } };
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1')).toBe('★★★☆☆');
		});
	});
});
