import { TestBed } from '@angular/core/testing';
import { FloatingChatComponent } from './floating-chat.component';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { UsersRepository } from '@foundation/users/state';
import { NotificationService } from '@foundation/notification';
import { RequestService } from '@foundation/network/services';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { Router, ActivatedRoute } from '@angular/router';
import { of, Subject, BehaviorSubject } from 'rxjs';
import { ITEM_REPOSITORY } from '@foundation/table/ui';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const articlesRepoMock = {
	store: {
		getObjects$: vi.fn().mockReturnValue(
			of({ data: [], totalCount: 0, page: 1, hasNext: false, hasPrev: false, self: '', all: '', next: '', prev: '' })
		),
		getObjectById$$$: vi.fn().mockReturnValue({ $: of(null) }),
		postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'art-1' } } })),
	},
};

const conversationsRepoMock = {
	createConversationFor$: vi.fn().mockReturnValue(of({ id: 'conv-1' })),
};

const usersRepoMock = {
	currentProfile: vi.fn().mockReturnValue({ id: 'user-1' }),
};

const notificationMock = {
	snack: vi.fn(),
	snackSuccess: vi.fn(),
	snackError: vi.fn(),
	confirm: vi.fn().mockReturnValue({ closed: of(true) }),
	prompt: vi.fn().mockReturnValue({ closed: of({ value: 'test ticket' }) }),
};

const requestServiceMock = {
	clearCache$: new Subject<void>(),
};

const translationMock = {
	prep: vi.fn().mockReturnValue(() => 'translated'),
	instant: vi.fn().mockReturnValue('translated'),
	translate$: vi.fn().mockReturnValue(of('translated')),
};

const routerMock = { navigate: vi.fn() };
const activatedRouteMock = { queryParams: of({}), snapshot: { queryParams: {} } };
const dragDropMock = {};

describe('FloatingChatComponent', () => {
	let component: FloatingChatComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [FloatingChatComponent],
			providers: [
				{ provide: ArticlesRepository, useValue: articlesRepoMock },
				{ provide: ITEM_REPOSITORY, useValue: articlesRepoMock },
				{ provide: ConversationsRepository, useValue: conversationsRepoMock },
				{ provide: UsersRepository, useValue: usersRepoMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: Router, useValue: routerMock },
				{ provide: ActivatedRoute, useValue: activatedRouteMock },
				{ provide: DragAndDropService, useValue: dragDropMock },
			],
		});
		const fixture = TestBed.createComponent(FloatingChatComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have isPanelOpen false by default', () => {
		expect(component.isPanelOpen()).toBe(false);
	});

	it('should have isDragging false by default', () => {
		expect(component.isDragging()).toBe(false);
	});

	it('should have no selected article by default', () => {
		expect(component.selectedArticle()).toBeNull();
	});

	it('should have isAuthenticated true when user exists', () => {
		expect(component.isAuthenticated()).toBe(true);
	});

	describe('togglePanel', () => {
		it('opens panel when closed', () => {
			component.togglePanel();
			expect(component.isPanelOpen()).toBe(true);
		});

		it('closes panel when open', () => {
			component.isPanelOpen.set(true);
			component.togglePanel();
			expect(component.isPanelOpen()).toBe(false);
		});

		it('does not toggle when recently dragged', () => {
			component.isDraggedRecently.set(true);
			component.togglePanel();
			expect(component.isPanelOpen()).toBe(false);
		});
	});

	describe('closePanel', () => {
		it('closes the panel', () => {
			component.isPanelOpen.set(true);
			component.closePanel();
			expect(component.isPanelOpen()).toBe(false);
		});
	});

	describe('trackById', () => {
		it('returns the item id', () => {
			expect(component.trackById(0, { id: 'art-1' } as any)).toBe('art-1');
		});
	});

	describe('selectArticle', () => {
		it('sets selected article', () => {
			const article = { id: 'art-1', title: 'Test' } as any;
			component.selectArticle(article);
			expect(component.selectedArticle()).toBe(article);
		});
	});

	describe('backToList', () => {
		it('clears selected article', () => {
			component.selectedArticle.set({ id: 'art-1' } as any);
			component.backToList();
			expect(component.selectedArticle()).toBeNull();
		});
	});

	describe('goToSupportPage', () => {
		it('navigates to /support', () => {
			component.goToSupportPage();
			expect(routerMock.navigate).toHaveBeenCalledWith(['/support']);
		});
	});

	describe('goToInternalSupportPage', () => {
		it('navigates to /host/dashboard/support', () => {
			component.goToInternalSupportPage();
			expect(routerMock.navigate).toHaveBeenCalledWith(['/host/dashboard/support']);
		});
	});

	describe('panelStyles', () => {
		it('returns an object with position fixed', () => {
			const styles = component.panelStyles();
			expect(styles.position).toBe('fixed');
			expect(styles.width).toBe('320px');
			expect(styles.height).toBe('384px');
		});
	});

	describe('createNewSupportTicket', () => {
		it('creates an article and conversation on success', () => {
			component.createNewSupportTicket();

			expect(notificationMock.prompt).toHaveBeenCalled();
			expect(articlesRepoMock.store.postObject$).toHaveBeenCalledWith(
				expect.objectContaining({ kind: 'support', title: 'test ticket' })
			);
			expect(conversationsRepoMock.createConversationFor$).toHaveBeenCalled();
			expect(component.isCreatingTicket()).toBe(false);
		});

		it('does nothing when prompt is cancelled', () => {
			notificationMock.prompt.mockReturnValue({ closed: of(null) });

			component.createNewSupportTicket();

			expect(articlesRepoMock.store.postObject$).not.toHaveBeenCalled();
		});

		it('stops loading when article creation returns no result', () => {
			articlesRepoMock.store.postObject$.mockReturnValue(of({}));

			component.createNewSupportTicket();

			expect(component.isCreatingTicket()).toBe(false);
		});
	});

	describe('drag handlers', () => {
		beforeEach(() => {
			(HTMLElement.prototype as any).setPointerCapture = vi.fn();
			(HTMLElement.prototype as any).releasePointerCapture = vi.fn();
		});

		function makePointerEvent(type: string, clientX: number, clientY: number, button = 0): PointerEvent {
			return new PointerEvent(type, { clientX, clientY, button, bubbles: true, pointerId: 1 });
		}

		it('starts dragging on left pointer down', () => {
			component.onPointerDown(makePointerEvent('pointerdown', 100, 200));
			expect(component.isDragging()).toBe(true);
		});

		it('ignores non-left button pointer down', () => {
			const event = makePointerEvent('pointerdown', 100, 200, 2);
			component.onPointerDown(event);
			expect(component.isDragging()).toBe(false);
		});

		it('moves position on pointer move while dragging', () => {
			component.isDragging.set(true);
			component.startPosition.set({ x: 100, y: 200 });
			component.initialButtonPosition.set({ x: 50, y: 60 });

			component.onPointerMove(makePointerEvent('pointermove', 110, 215));

			expect(component.position().x).toBe(60);
			expect(component.position().y).toBe(75);
		});

		it('ignores pointer move when not dragging', () => {
			const initial = component.position();
			component.onPointerMove(makePointerEvent('pointermove', 999, 999));
			expect(component.position()).toEqual(initial);
		});

		it('ends dragging on pointer up', () => {
			component.isDragging.set(true);
			component.startPosition.set({ x: 100, y: 200 });
			component.onPointerUp(makePointerEvent('pointerup', 101, 201));
			expect(component.isDragging()).toBe(false);
		});

		it('sets isDraggedRecently when dragged more than 5px', () => {
			vi.useFakeTimers();
			component.isDragging.set(true);
			component.startPosition.set({ x: 100, y: 200 });
			component.onPointerUp(makePointerEvent('pointerup', 110, 210));
			expect(component.isDraggedRecently()).toBe(true);
			vi.advanceTimersByTime(300);
			expect(component.isDraggedRecently()).toBe(false);
			vi.useRealTimers();
		});

		it('closes panel during drag when moved more than 3px', () => {
			component.isPanelOpen.set(true);
			// Go through onPointerDown so _wasPanelOpenBeforeDrag is set
			component.onPointerDown(makePointerEvent('pointerdown', 100, 200));
			component.onPointerMove(makePointerEvent('pointermove', 110, 210));

			expect(component.isPanelOpen()).toBe(false);
		});
	});

	describe('ngOnDestroy', () => {
		it('removes the resize event listener', () => {
			const removeSpy = vi.spyOn(window, 'removeEventListener');
			component.ngOnDestroy();
			expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
		});
	});
});
