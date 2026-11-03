import { TestBed } from '@angular/core/testing';
import { FeedbackService } from '@foundation/feedback/state';
import * as echarts from 'echarts';
import { of, Subject, throwError } from 'rxjs';
import { FeedbackModals } from '../feedback.modals';
import { FeedbackAdminPageComponent } from './feedback-admin-page.component';

vi.mock('echarts', () => ({
	init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn() })),
}));

describe('FeedbackAdminPageComponent', () => {
	const interactions = [
		{
			id: 'newest',
			key: 'feedback.homepage',
			userId: 'user-1',
			timeCreated: '2026-08-04T12:00:00Z',
			config: { response: { timestamp: 2, blocks: [{ kind: 'text', text: 'Great' }] } },
		},
		{
			id: 'anonymous',
			key: 'feedback.homepage',
			timeCreated: '2026-08-03T12:00:00Z',
			config: { response: { timestamp: 1, blocks: [{ kind: 'rating', value: 4 }] } },
		},
		{ id: 'seen-only', key: 'feedback.homepage', userId: 'user-2', config: {} },
		{ id: 'other', key: 'feedback.checkout', userId: 'user-3', config: {} },
	] as never[];
	let feedbackService: { listFeedbackInteractions$: ReturnType<typeof vi.fn> };
	let feedbackModals: { openFeedbackSelectionDialog: ReturnType<typeof vi.fn> };

	function createComponent(source = of(interactions)) {
		feedbackService.listFeedbackInteractions$.mockReturnValue(source);
		const fixture = TestBed.createComponent(FeedbackAdminPageComponent);
		fixture.detectChanges();
		return fixture.componentInstance;
	}

	beforeEach(() => {
		feedbackService = { listFeedbackInteractions$: vi.fn() };
		feedbackModals = { openFeedbackSelectionDialog: vi.fn() };
		TestBed.configureTestingModule({
			imports: [FeedbackAdminPageComponent],
			providers: [
				{ provide: FeedbackService, useValue: feedbackService },
				{ provide: FeedbackModals, useValue: feedbackModals },
			],
		});
		TestBed.overrideComponent(FeedbackAdminPageComponent, {
			set: { imports: [], template: '' },
		});
	});

	it('loads, groups, and summarizes interactions by feedback key', () => {
		const component = createComponent();

		expect(component.isLoading()).toBe(false);
		expect(component.feedbackGroups()).toHaveLength(2);
		const homepage = component.feedbackGroups()[0];
		expect(homepage.slug).toBe('homepage');
		expect(homepage.interactions).toHaveLength(3);
		expect(homepage.answeredInteractions.map((item) => item.id)).toEqual(['newest', 'anonymous']);
		expect(homepage.identifiedAnsweredUserIds).toEqual(['user-1']);
		expect(homepage.anonymousAnsweredCount).toBe(1);
	});

	it('stops loading when the request fails', () => {
		const component = createComponent(throwError(() => new Error('offline')));
		expect(component.isLoading()).toBe(false);
		expect(component.feedbackGroups()).toEqual([]);
	});

	it('applies a modal selection and resets visible-user limits', () => {
		const closed = new Subject<{ selectedSlugs: string[] } | undefined>();
		feedbackModals.openFeedbackSelectionDialog.mockReturnValue({ closed });
		const component = createComponent();

		component.openFeedbackSelectionModal();
		expect(feedbackModals.openFeedbackSelectionDialog).toHaveBeenCalledWith({
			items: [
				{ slug: 'homepage', key: 'feedback.homepage', seenCount: 3, answeredCount: 2 },
				{ slug: 'checkout', key: 'feedback.checkout', seenCount: 1, answeredCount: 0 },
			],
			selectedSlugs: [],
		});

		closed.next(undefined);
		expect(component.selectedFeedbackSlugs()).toEqual([]);
		closed.next({ selectedSlugs: ['homepage'] });
		expect(component.selectedFeedbackSlugs()).toEqual(['homepage']);
		expect(component.displayedFeedbackGroups().map((group) => group.slug)).toEqual(['homepage']);
		expect(component.visibleAnsweredUsersLimitBySlug()).toEqual({ homepage: 10 });
	});

	it('paginates answered users, clears selection, and transposes block responses', () => {
		const component = createComponent();
		const group = {
			...component.feedbackGroups()[0],
			identifiedAnsweredUserIds: Array.from({ length: 23 }, (_, index) => `user-${index}`),
			responses: [
				{ timestamp: 1, blocks: [{ kind: 'text', text: 'one' }, { kind: 'rating', value: 3 }] },
				{ timestamp: 2, blocks: [{ kind: 'text', text: 'two' }] },
			],
		};

		expect(component.visibleIdentifiedAnsweredUserIds(group as never)).toHaveLength(10);
		expect(component.remainingIdentifiedAnsweredUsersCount(group as never)).toBe(13);
		component.showTenMoreAnsweredUsers('homepage');
		expect(component.visibleIdentifiedAnsweredUserIds(group as never)).toHaveLength(20);
		expect(component.remainingIdentifiedAnsweredUsersCount(group as never)).toBe(3);
		expect(component.groupedBlockResponses(group as never).map((responses) => responses.length)).toEqual([2, 1]);

		component.selectedFeedbackSlugs.set(['homepage']);
		component.clearFeedbackSelection();
		expect(component.selectedFeedbackSlugs()).toEqual([]);
		expect(component.visibleAnsweredUsersLimitBySlug()).toEqual({});
	});

	it('renders MCQ, rating, and NPS aggregates and disposes their charts', () => {
		const component = createComponent();
		const responses = [
			{ timestamp: 1, blocks: [
				{ kind: 'mcq', selectedIds: ['a', 'b'] },
				{ kind: 'rating', value: 4 },
				{ kind: 'nps', score: 9 },
			] },
			{ timestamp: 2, blocks: [
				{ kind: 'mcq', selectedIds: ['a'] },
				{ kind: 'rating', value: 2 },
				{ kind: 'nps', score: 5 },
			] },
		];
		for (let index = 0; index < 3; index++) {
			const host = document.createElement('div');
			host.id = `chart-homepage-${index}`;
			document.body.appendChild(host);
		}
		const group = { ...component.feedbackGroups()[0], responses };

		(component as unknown as { _initCharts(groups: unknown[]): void })._initCharts([group]);

		expect(echarts.init).toHaveBeenCalledTimes(3);
		const charts = vi.mocked(echarts.init).mock.results.map((result) => result.value);
		expect(charts[0].setOption).toHaveBeenCalledWith(expect.objectContaining({
			series: [expect.objectContaining({ data: [{ name: 'a', value: 2 }, { name: 'b', value: 1 }] })],
		}));
		expect(charts[1].setOption).toHaveBeenCalledWith(expect.objectContaining({
			xAxis: expect.objectContaining({ data: ['2', '4'] }),
			series: [{ type: 'bar', data: [1, 1] }],
		}));
		expect(charts[2].setOption).toHaveBeenCalledWith(expect.objectContaining({
			xAxis: expect.objectContaining({ data: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] }),
		}));

		component.ngOnDestroy();
		for (const chart of charts) expect(chart.dispose).toHaveBeenCalledOnce();
	});

	// A card is clicked, not answered, and the ratio of the two is the whole point of it.
	describe('announcement cards', () => {
		const cardInteractions = [
			{
				id: 'clicked-guide',
				key: 'feedback.spoken-rumble-migration',
				userId: 'user-1',
				timeCreated: '2026-08-24T12:00:00Z',
				config: { response: { timestamp: 1, blocks: [{ kind: 'cta', clickedIds: ['guide'] }] } },
			},
			{
				id: 'clicked-both',
				key: 'feedback.spoken-rumble-migration',
				userId: 'user-2',
				timeCreated: '2026-08-24T12:01:00Z',
				config: { response: { timestamp: 2, blocks: [{ kind: 'cta', clickedIds: ['guide', 'tool'] }] } },
			},
			{ id: 'saw-only-1', key: 'feedback.spoken-rumble-migration', userId: 'user-3', config: {} },
			{ id: 'saw-only-2', key: 'feedback.spoken-rumble-migration', userId: 'user-4', config: {} },
		] as never[];

		it('reads a cta-only group as an announcement', () => {
			const component = createComponent(of(cardInteractions));

			expect(component.feedbackGroups()[0].isAnnouncement).toBe(true);
		});

		it('does not mistake an ordinary widget for one', () => {
			const component = createComponent();

			expect(component.feedbackGroups()[0].isAnnouncement).toBe(false);
		});

		it('reports clicks over impressions', () => {
			const component = createComponent(of(cardInteractions));
			const group = component.feedbackGroups()[0];

			// two clicked of four who saw it
			expect(component.clickThroughRate(group)).toBe('50%');
		});

		it('breaks the rate down per link, busiest first', () => {
			const component = createComponent(of(cardInteractions));
			const group = component.feedbackGroups()[0];

			expect(component.ctaLinkCounts(group, 0)).toEqual([
				{ id: 'guide', count: 2, rate: '50%' },
				{ id: 'tool', count: 1, rate: '25%' },
			]);
		});

		it('says 0% rather than dividing by nobody', () => {
			const component = createComponent(of([]));

			expect(component.clickThroughRate({ interactions: [], responses: [] } as never)).toBe('0%');
		});
	});
});
