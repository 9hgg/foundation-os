import {
	afterNextRender,
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	computed,
	effect,
	inject,
	Injector,
	OnDestroy,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Interaction } from '@foundation/interactions/models';
import { QuestionMarkHelpComponent } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { UserPillComponent } from '@foundation/users/ui';
import { RouterModule } from '@angular/router';
import {
	FEEDBACK_INTERACTION_PREFIX,
	FeedbackBlockResponse,
	FeedbackResponse,
	isFeedbackResponse,
	isMCQFeedbackResponse,
	isNPSFeedbackResponse,
	isRatingFeedbackResponse,
	isTextFeedbackResponse,
	isTextareaFeedbackResponse,
} from '@foundation/feedback/models';
import { FeedbackService } from '@foundation/feedback/state';
import { FeedbackModals } from '../feedback.modals';
import * as echarts from 'echarts';

interface FeedbackSelectionItem {
	slug: string;
	key: string;
	seenCount: number;
	answeredCount: number;
}

interface FeedbackGroup {
	slug: string;
	key: string;
	interactions: Interaction[];
	answeredInteractions: Interaction[];
	responses: FeedbackResponse[];
	identifiedAnsweredUserIds: string[];
	anonymousAnsweredCount: number;
}

const INITIAL_VISIBLE_ANSWERED_USERS = 10;
const ANSWERED_USERS_PAGE_STEP = 10;

@Component({
	selector: 'lib-feedback-admin-page',
	standalone: true,
	imports: [FormsModule, TranslateDirective, QuestionMarkHelpComponent, UserPillComponent, RouterModule],
	template: `
		<div class="flex h-full flex-col gap-6 overflow-y-auto p-6">
			<div>
				<h1 class="text-3xl font-bold" [translate]>Feedback Dashboard</h1>
				<p class="text-base-content/60 mt-2" [translate]>View all feedback interactions and responses.</p>
			</div>

			@if (isLoading()) {
				<div class="flex items-center justify-center p-16">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			} @else if (feedbackGroups().length === 0) {
				<div class="flex flex-col items-center gap-4 py-16 text-center">
					<div class="text-5xl">📭</div>
					<p class="text-base-content/60" [translate]>No feedback interactions found yet.</p>
				</div>
			} @else {
				<div class="bg-base-100 border-base-200 flex flex-wrap items-center gap-3 rounded-xl border p-4 shadow-sm">
					<button class="btn btn-primary btn-sm" (click)="openFeedbackSelectionModal()" [translate]>
						Select feedbacks
					</button>
					@if (selectedFeedbackSlugs().length > 0) {
						<button class="btn btn-ghost btn-sm" (click)="clearFeedbackSelection()" [translate]>
							Clear selection
						</button>
						<span class="badge badge-outline">{{ selectedFeedbackSlugs().length }} selected</span>
					}
				</div>

				@if (displayedFeedbackGroups().length === 0) {
					<div class="border-base-200 bg-base-100 rounded-xl border px-6 py-10 text-center shadow-sm">
						<p class="text-base-content/70" [translate]>No feedback selected. Use "Select feedbacks" to choose which cards to display.</p>
					</div>
				} @else {
				<div class="grid gap-6">
					@for (group of displayedFeedbackGroups(); track group.slug) {
						<div class="bg-base-100 border-base-200 rounded-xl border shadow-sm">
							<div class="border-base-200 flex items-center justify-between border-b px-6 py-4">
								<div>
									<h2 class="font-semibold">{{ group.slug }}</h2>
									<span class="text-base-content/50 text-xs">{{ group.key }}</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="badge badge-neutral">{{ group.responses.length }}/{{ group.interactions.length }} answered</span>
									<lib-question-mark-helper
										[title]="'Answered vs seen'"
										[message]="'First number: users who submitted feedback. Second number: users who saw the widget (interaction tracked even if no answer was submitted).'"
									/>
								</div>
							</div>

							@if (group.answeredInteractions.length > 0) {
								<div class="border-base-200 flex flex-wrap items-center gap-2 border-b px-6 py-3 text-xs">
									<span class="text-base-content/70">Answered users:</span>
									@if (visibleIdentifiedAnsweredUserIds(group).length > 0) {
										@for (answeredUserId of visibleIdentifiedAnsweredUserIds(group); track answeredUserId) {
											<a class="link link-hover" [routerLink]="['/admin/users', answeredUserId, 'builder']">
												<lib-user-pill [userId]="answeredUserId" />
											</a>
										}
									}
									@if (group.anonymousAnsweredCount > 0) {
										<span class="badge badge-ghost badge-sm">{{ group.anonymousAnsweredCount }} anonymous</span>
									}
									@if (remainingIdentifiedAnsweredUsersCount(group) > 0) {
										<button class="btn btn-xs btn-ghost" (click)="showTenMoreAnsweredUsers(group.slug)">
											See 10 more
										</button>
									}
								</div>
							}

							<div class="divide-base-200 divide-y p-6">
								@if (group.responses.length === 0) {
									<p class="text-base-content/40 text-sm" [translate]>No responses yet.</p>
								} @else {
									@for (blockResponses of groupedBlockResponses(group); track $index; let bi = $index) {
										<div class="py-4 first:pt-0 last:pb-0">
											<p class="text-base-content/50 mb-3 text-xs uppercase tracking-wide">Block {{ bi + 1 }} — {{ blockResponses[0]?.kind }}</p>

											@switch (blockResponses[0]?.kind) {
												@case ('mcq') {
													<div [id]="'chart-' + group.slug + '-' + bi" class="h-64 w-full"></div>
												}
												@case ('rating') {
													<div [id]="'chart-' + group.slug + '-' + bi" class="h-64 w-full"></div>
												}
												@case ('nps') {
													<div [id]="'chart-' + group.slug + '-' + bi" class="h-64 w-full"></div>
												}
												@default {
													<div class="max-h-64 overflow-y-auto">
														<ul class="space-y-2">
															@for (blockResponse of blockResponses; track $index) {
																@if (isTextFeedbackResponse(blockResponse)) {
																	<li class="bg-base-200/60 rounded-lg px-4 py-2 text-sm">{{ blockResponse.text }}</li>
																} @else if (isTextareaFeedbackResponse(blockResponse)) {
																	<li class="bg-base-200/60 rounded-lg px-4 py-2 text-sm" [innerHTML]="blockResponse.html"></li>
																}
															}
														</ul>
													</div>
												}
											}
										</div>
									}
								}
							</div>
						</div>
					}
				</div>
				}
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackAdminPageComponent implements AfterViewInit, OnDestroy {
	private _feedbackService = inject(FeedbackService);
	private _feedbackModals = inject(FeedbackModals);
	private _cdr = inject(ChangeDetectorRef);
	private _injector = inject(Injector);

	readonly isLoading = signal(true);
	readonly allInteractions = signal<Interaction[]>([]);
	readonly selectedFeedbackSlugs = signal<string[]>([]);
	readonly visibleAnsweredUsersLimitBySlug = signal<Record<string, number>>({});

	private _chartInstances: echarts.ECharts[] = [];

	// Expose type guards to template
	readonly isMCQFeedbackResponse = isMCQFeedbackResponse;
	readonly isTextFeedbackResponse = isTextFeedbackResponse;
	readonly isTextareaFeedbackResponse = isTextareaFeedbackResponse;
	readonly isRatingFeedbackResponse = isRatingFeedbackResponse;
	readonly isNPSFeedbackResponse = isNPSFeedbackResponse;

	readonly feedbackGroups = computed<FeedbackGroup[]>(() => {
		const interactions = this.allInteractions();
		const groupMap = new Map<string, Interaction[]>();

		for (const interaction of interactions) {
			const key = interaction.key ?? '';
			if (!groupMap.has(key)) {
				groupMap.set(key, []);
			}
			groupMap.get(key)!.push(interaction);
		}

		return Array.from(groupMap.entries()).map(([key, interactionList]) => {
			const slug = key.replace(`${FEEDBACK_INTERACTION_PREFIX}.`, '');
			const answeredInteractions = [...interactionList]
				.filter((interaction) => isFeedbackResponse(interaction.config['response']))
				.sort((leftInteraction, rightInteraction) => (rightInteraction.timeCreated ?? '').localeCompare(leftInteraction.timeCreated ?? ''));
			const responses = answeredInteractions
				.map((i) => i.config['response'])
				.filter((r): r is FeedbackResponse => isFeedbackResponse(r));
			const identifiedAnsweredUserIds = Array.from(
				new Set(
					answeredInteractions
						.map((interaction) => interaction.userId)
						.filter((interactionUserId): interactionUserId is string => typeof interactionUserId === 'string' && interactionUserId.length > 0)
				)
			);
			const anonymousAnsweredCount = answeredInteractions.filter((interaction) => !interaction.userId).length;

			return {
				slug,
				key,
				interactions: interactionList,
				answeredInteractions,
				responses,
				identifiedAnsweredUserIds,
				anonymousAnsweredCount,
			};
		}).sort((leftGroup, rightGroup) => rightGroup.interactions.length - leftGroup.interactions.length);
	});

	readonly displayedFeedbackGroups = computed(() => {
		const selectedSlugs = this.selectedFeedbackSlugs();
		if (selectedSlugs.length === 0) {
			return [] as FeedbackGroup[];
		}
		const selectedSlugSet = new Set(selectedSlugs);
		return this.feedbackGroups().filter((group) => selectedSlugSet.has(group.slug));
	});

	constructor() {
		this._feedbackService.listFeedbackInteractions$().subscribe({
			next: (interactions) => {
				this.allInteractions.set(interactions);
				this.visibleAnsweredUsersLimitBySlug.set({});
				this.isLoading.set(false);
				this._cdr.markForCheck();
			},
			error: () => {
				this.isLoading.set(false);
				this._cdr.markForCheck();
			},
		});

		effect(() => {
			const groups = this.displayedFeedbackGroups();
			if (groups.length > 0 && !this.isLoading()) {
				afterNextRender(() => this._initCharts(groups), { injector: this._injector });
			}
		});
	}

	openFeedbackSelectionModal(): void {
		const feedbackSelectionItems: FeedbackSelectionItem[] = this.feedbackGroups().map((group) => ({
			slug: group.slug,
			key: group.key,
			seenCount: group.interactions.length,
			answeredCount: group.responses.length,
		}));

		const dialogRef = this._feedbackModals.openFeedbackSelectionDialog({
			items: feedbackSelectionItems,
			selectedSlugs: this.selectedFeedbackSlugs(),
		});

		dialogRef.closed.subscribe((result) => {
			if (!result) {
				return;
			}
			this.selectedFeedbackSlugs.set(result.selectedSlugs);
			const nextVisibleAnsweredUsersLimitBySlug: Record<string, number> = {};
			for (const selectedSlug of result.selectedSlugs) {
				nextVisibleAnsweredUsersLimitBySlug[selectedSlug] = INITIAL_VISIBLE_ANSWERED_USERS;
			}
			this.visibleAnsweredUsersLimitBySlug.set(nextVisibleAnsweredUsersLimitBySlug);
		});
	}

	clearFeedbackSelection(): void {
		this.selectedFeedbackSlugs.set([]);
		this.visibleAnsweredUsersLimitBySlug.set({});
	}

	visibleIdentifiedAnsweredUserIds(group: FeedbackGroup): string[] {
		const limit = this.visibleAnsweredUsersLimitBySlug()[group.slug] ?? INITIAL_VISIBLE_ANSWERED_USERS;
		return group.identifiedAnsweredUserIds.slice(0, limit);
	}

	remainingIdentifiedAnsweredUsersCount(group: FeedbackGroup): number {
		const visibleCount = this.visibleIdentifiedAnsweredUserIds(group).length;
		return Math.max(group.identifiedAnsweredUserIds.length - visibleCount, 0);
	}

	showTenMoreAnsweredUsers(slug: string): void {
		this.visibleAnsweredUsersLimitBySlug.update((currentVisibleAnsweredUsersLimitBySlug) => ({
			...currentVisibleAnsweredUsersLimitBySlug,
			[slug]: (currentVisibleAnsweredUsersLimitBySlug[slug] ?? INITIAL_VISIBLE_ANSWERED_USERS) + ANSWERED_USERS_PAGE_STEP,
		}));
	}

	ngAfterViewInit(): void {
		// Charts are initialized after data loads via effect
	}

	ngOnDestroy(): void {
		this._disposeCharts();
	}

	/**
	 * Transpose responses: for each block position, collect that block's responses across all users.
	 */
	groupedBlockResponses(group: FeedbackGroup): FeedbackBlockResponse[][] {
		if (group.responses.length === 0) return [];
		const maxBlocks = Math.max(...group.responses.map((r) => r.blocks.length));
		return Array.from({ length: maxBlocks }, (_, bi) =>
			group.responses.map((r) => r.blocks[bi]).filter((b): b is FeedbackBlockResponse => b !== undefined)
		);
	}

	private _disposeCharts(): void {
		for (const chart of this._chartInstances) {
			chart.dispose();
		}
		this._chartInstances = [];
	}

	private _initCharts(groups: FeedbackGroup[]): void {
		this._disposeCharts();

		for (const group of groups) {
			const blockMatrix = this.groupedBlockResponses(group);
			blockMatrix.forEach((blockResponses, bi) => {
				if (blockResponses.length === 0) return;
				const firstKind = blockResponses[0].kind;

				if (firstKind === 'mcq') {
					this._initMCQChart(group.slug, bi, blockResponses);
				} else if (firstKind === 'rating') {
					this._initRatingChart(group.slug, bi, blockResponses);
				} else if (firstKind === 'nps') {
					this._initNPSChart(group.slug, bi, blockResponses);
				}
			});
		}
	}

	private _initMCQChart(slug: string, blockIndex: number, responses: FeedbackBlockResponse[]): void {
		const hostElement = document.getElementById(`chart-${slug}-${blockIndex}`);
		if (!hostElement) return;

		const chart = echarts.init(hostElement);
		this._chartInstances.push(chart);

		const countMap = new Map<string, number>();
		for (const response of responses) {
			if (!isMCQFeedbackResponse(response)) continue;
			for (const id of response.selectedIds) {
				countMap.set(id, (countMap.get(id) ?? 0) + 1);
			}
		}

		chart.setOption({
			tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
			legend: { type: 'scroll', bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
			series: [
				{
					type: 'pie',
					radius: ['40%', '70%'],
					center: ['50%', '42%'],
					avoidLabelOverlap: true,
					itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
					label: { show: false },
					emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
					data: Array.from(countMap.entries()).map(([name, value]) => ({ name, value })),
				},
			],
		} as echarts.EChartsOption);
	}

	private _initRatingChart(slug: string, blockIndex: number, responses: FeedbackBlockResponse[]): void {
		const hostElement = document.getElementById(`chart-${slug}-${blockIndex}`);
		if (!hostElement) return;

		const chart = echarts.init(hostElement);
		this._chartInstances.push(chart);

		const countMap = new Map<number, number>();
		for (const response of responses) {
			if (!isRatingFeedbackResponse(response)) continue;
			countMap.set(response.value, (countMap.get(response.value) ?? 0) + 1);
		}
		const sorted = Array.from(countMap.entries()).sort(([a], [b]) => a - b);

		chart.setOption({
			tooltip: { trigger: 'axis' },
			xAxis: { type: 'category', data: sorted.map(([v]) => String(v)) },
			yAxis: { type: 'value', minInterval: 1 },
			series: [{ type: 'bar', data: sorted.map(([, c]) => c) }],
		} as echarts.EChartsOption);
	}

	private _initNPSChart(slug: string, blockIndex: number, responses: FeedbackBlockResponse[]): void {
		const hostElement = document.getElementById(`chart-${slug}-${blockIndex}`);
		if (!hostElement) return;

		const chart = echarts.init(hostElement);
		this._chartInstances.push(chart);

		const countMap = new Map<number, number>();
		for (let i = 0; i <= 10; i++) countMap.set(i, 0);
		for (const response of responses) {
			if (!isNPSFeedbackResponse(response)) continue;
			countMap.set(response.score, (countMap.get(response.score) ?? 0) + 1);
		}
		const sorted = Array.from(countMap.entries()).sort(([a], [b]) => a - b);

		chart.setOption({
			tooltip: { trigger: 'axis' },
			xAxis: { type: 'category', data: sorted.map(([v]) => String(v)) },
			yAxis: { type: 'value', minInterval: 1 },
			series: [
				{
					type: 'bar',
					data: sorted.map(([score, count]) => ({
						value: count,
						itemStyle: {
							color: score <= 6 ? '#f87272' : score <= 8 ? '#fbbd23' : '#36d399',
						},
					})),
				},
			],
		} as echarts.EChartsOption);
	}
}
