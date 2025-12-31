import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { TwCrossIcon, TwInfoCircleIcon } from '@foundation/icons';
import { RepositoryTableComponent } from '@foundation/table/ui';
import { UsersRepository } from '@foundation/users/state';
import { slugify } from '@foundation/utils';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ChatDisplayerComponent } from '../chat-displayer/chat-displayer.component';

type PositionPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

@Component({
	selector: 'lib-floating-chat',
	standalone: true,
	imports: [CommonModule, TwInfoCircleIcon, TwCrossIcon, DatePipe, TranslateDirective, ChatDisplayerComponent, RouterLink],
	templateUrl: './floating-chat.component.html',
	styleUrls: ['./floating-chat.component.css'],
})
export class FloatingChatComponent extends RepositoryTableComponent<Article, ArticlesRepository> implements OnDestroy {
	@Input() initialPositionPreset: PositionPreset = 'bottom-right';

	// Repositories and Services
	private _usersRepository = inject(UsersRepository);
	private _conversationsRepository = inject(ConversationsRepository);

	// Signals for drag functionality
	position = signal({ x: 0, y: 0 }); // Current absolute position
	isDragging = signal(false);
	isDraggedRecently = signal(false); // Track if recently dragged to prevent panel toggle
	startPosition = signal({ x: 0, y: 0 }); // Pointer position at drag start
	initialButtonPosition = signal({ x: 0, y: 0 }); // Button's absolute position at drag start

	// Signals for panel
	isPanelOpen = signal(false);
	initialButtonRect = signal<DOMRect | null>(null);
	// Example panel dimensions - these could be inputs or dynamic
	private readonly _panelWidth = 320;
	private readonly _panelHeight = 384;
	private readonly _gap = 10; // Gap between button and panel

	// Check if user is authenticated
	isAuthenticated = computed(() => !!this._usersRepository.currentProfile());

	selectedArticle = signal<Article | null>(null);

	isTyping = signal(false); // Track if someone is typing in the chat (to be used later)
	isCreatingTicket = signal(false); // Track if creating a new support ticket

	supportButton = viewChild<ElementRef<HTMLButtonElement>>('supportButton');
	chatDisplayer = viewChild<ChatDisplayerComponent>('chatDisplayer');

	displayRedPulse = signal(false); // Signal to control red pulse animation on the button
	displayArticleStatus = signal(false); // Signal to control article status display

	// Store resize event listener reference for cleanup
	private _resizeListener: (() => void) | null = null;

	// Track if panel was open before dragging (simple boolean, not a signal)
	private _wasPanelOpenBeforeDrag = false;

	constructor(private _repository: ArticlesRepository) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeUpdated', direction: 'desc' },
				alwaysOnFilters: [
					{
						fieldName: 'kind',
						value: 'support',
						matchType: 'exact',
					},
				],
				pageSize: 5,
			},
			'emit'
		);

		effect(() => {
			const supportButton = this.supportButton();
			if (supportButton) {
				this.setInitialPosition();
				this.initialButtonRect.set(supportButton.nativeElement.getBoundingClientRect());
			}
		});

		// Set up window resize listener
		this.setupResizeListener();
	}

	override ngOnDestroy(): void {
		// Clean up the resize event listener
		if (this._resizeListener) {
			window.removeEventListener('resize', this._resizeListener);
			this._resizeListener = null;
		}
		super.ngOnDestroy();
	}

	private setupResizeListener(): void {
		this._resizeListener = () => {
			this.handleWindowResize();
		};
		window.addEventListener('resize', this._resizeListener);
	}

	private handleWindowResize(): void {
		// Reset to initial position on window resize
		this.setInitialPosition();
	}

	private setInitialPosition(): void {
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const buttonSize = 56; // 14 * 4 = 56px (h-14 w-14)
		const margin = 24; // 6 * 4 = 24px (p-6)

		let x = 0;
		let y = 0;

		switch (this.initialPositionPreset) {
			case 'top-left':
				x = margin;
				y = margin;
				break;
			case 'top-right':
				x = viewportWidth - buttonSize - margin;
				y = margin;
				break;
			case 'bottom-left':
				x = margin;
				y = viewportHeight - buttonSize - margin;
				break;
			case 'bottom-right':
				x = viewportWidth - buttonSize - margin;
				y = viewportHeight - buttonSize - margin;
				break;
			default:
				x = viewportWidth - buttonSize - margin;
				y = viewportHeight - buttonSize - margin;
		}

		this.position.set({ x, y });
	}
	// Drag handlers
	onPointerDown(event: PointerEvent): void {
		// Check if the event target is the button itself to prevent drag from panel clicks if panel is inside button
		const buttonElement = this.supportButton();
		if (event.target !== buttonElement?.nativeElement && !buttonElement?.nativeElement.contains(event.target as Node)) {
			// If we want to allow drag only on button, uncomment this
			// return;
		}

		if (event.button !== 0) return;

		// Store panel state before dragging - but don't close it yet
		// Only close when we actually start dragging (in onPointerMove)
		this._wasPanelOpenBeforeDrag = this.isPanelOpen();

		this.isDragging.set(true);
		this.startPosition.set({ x: event.clientX, y: event.clientY });
		this.initialButtonPosition.set({ x: this.position().x, y: this.position().y }); // Current absolute position

		// Capture pointer on the button element to ensure events are received even if pointer leaves it
		buttonElement?.nativeElement.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	onPointerMove(event: PointerEvent): void {
		if (!this.isDragging()) return;

		const deltaX = event.clientX - this.startPosition().x;
		const deltaY = event.clientY - this.startPosition().y;
		const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Close panel when we start actually dragging (moved more than 3px)
		if (dragDistance > 3 && this._wasPanelOpenBeforeDrag && this.isPanelOpen()) {
			this.isPanelOpen.set(false);
		}

		this.position.set({
			x: this.initialButtonPosition().x + deltaX,
			y: this.initialButtonPosition().y + deltaY,
		});
	}

	onPointerUp(event: PointerEvent): void {
		if (!this.isDragging()) return;

		const deltaX = event.clientX - this.startPosition().x;
		const deltaY = event.clientY - this.startPosition().y;
		const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// If dragged more than 5px, set isDraggedRecently to prevent toggle
		if (dragDistance > 5) {
			this.isDraggedRecently.set(true);
			// Reset after a short delay
			setTimeout(() => this.isDraggedRecently.set(false), 200);

			// Reopen panel if it was open before dragging
			if (this._wasPanelOpenBeforeDrag) {
				this.isPanelOpen.set(true);
			}
		}

		this.isDragging.set(false);
		this._wasPanelOpenBeforeDrag = false; // Reset the flag
		const buttonElement = this.supportButton();
		buttonElement?.nativeElement.releasePointerCapture(event.pointerId);
	}

	// Panel open/close methods
	togglePanel(): void {
		// Prevent toggle if recently dragged
		if (this.isDraggedRecently()) {
			return;
		}
		const wasOpen = this.isPanelOpen();
		this.isPanelOpen.update((isOpen) => !isOpen);

		// Refresh the list when opening the panel
		if (!wasOpen && this.isPanelOpen()) {
			this.refreshSupportTickets();

			// If we have a selected article (chat view), scroll to bottom after opening
			if (this.selectedArticle()) {
				setTimeout(() => {
					this.scrollToBottomOfChat();
				}, 200);
			}
		}
	}

	closePanel(): void {
		this.isPanelOpen.set(false);
		// Refresh the list when closing the panel
		this.refreshSupportTickets();
	}

	private refreshSupportTickets(): void {
		// Force refresh the current page data
		this.paginator.refresh();
	}

	trackById(index: number, item: Article): string {
		return item.id;
	}

	selectArticle(article: Article): void {
		this.selectedArticle.set(article);
		// Don't navigate automatically - let user choose to view full page or stay in floating chat

		// Smoothly scroll to bottom of chat after a short delay to ensure DOM is rendered
		setTimeout(() => {
			this.scrollToBottomOfChat();
		}, 150);
	}

	/**
	 * Scrolls to the bottom of the chat messages smoothly
	 */
	private scrollToBottomOfChat(): void {
		// Try to find the bottom anchor in the chat displayer
		const bottomAnchor = document.getElementById('bottom-anchor');
		if (bottomAnchor) {
			bottomAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	backToList(): void {
		this.selectedArticle.set(null);
	}

	createNewSupportTicket(): void {
		const articleId = uuidv4();

		this._notificationService
			.prompt(undefined, this._translationService.prep('Give a name to your request:')(), { width: '300px' })
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return of(null);
					const articleName = promptResult.value;

					if (!articleName) return of(null);

					// Start loading
					this.isCreatingTicket.set(true);

					const article: Article = {
						id: articleId,
						kind: 'support',
						title: articleName,
						slug: slugify(articleName) + '_' + articleId,
						featured: false,
						draft: false,
						tags: [],
						config: {
							commentsEnabled: true,
						},
					};
					return this._repository.store.postObject$(article);
				}),
				switchMap((r) => {
					if (r?.result?.data) {
						return this._conversationsRepository.createConversationFor$(articleId, 'article', 'default').pipe(
							tap((conversation) => {
								console.log('Conversation created or retrieved:', conversation);
								if (conversation) {
									// Set the new article as selected and refresh the list
									this.selectedArticle.set(r.result.data);
									this.refreshSupportTickets();
								}
								// Stop loading
								this.isCreatingTicket.set(false);
							})
						);
					}
					// Stop loading if no result
					this.isCreatingTicket.set(false);
					return of(null);
				})
			)
			.subscribe({
				error: () => {
					// Stop loading on error
					this.isCreatingTicket.set(false);
				},
			});
	}

	goToSupportPage(): void {
		this.closePanel();
		this._router.navigate(['/support']);
	}

	goToInternalSupportPage(): void {
		this.closePanel();
		this._router.navigate(['/host/dashboard/support']);
	}

	// Computed styles for the panel
	panelStyles = computed(() => {
		const currentPosition = this.position();
		const buttonSize = 56; // h-14 w-14 = 56px

		const currentButtonX = currentPosition.x;
		const currentButtonY = currentPosition.y;
		const buttonWidth = buttonSize;
		const buttonHeight = buttonSize;

		let top: string | 'auto' = 'auto';
		let right: string | 'auto' = 'auto';
		let bottom: string | 'auto' = 'auto';
		let left: string | 'auto' = 'auto';

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Determine optimal panel placement based on available space
		const spaceRight = viewportWidth - (currentButtonX + buttonWidth);
		const spaceLeft = currentButtonX;
		const spaceBelow = viewportHeight - (currentButtonY + buttonHeight);
		const spaceAbove = currentButtonY;

		// Choose horizontal position (prefer original preset, but adjust if needed)
		const preferRight = this.initialPositionPreset.includes('right');
		const useRight = preferRight ? spaceRight >= this._panelWidth : spaceLeft < this._panelWidth;

		// Choose vertical position (prefer original preset, but adjust if needed)
		const preferBottom = this.initialPositionPreset.includes('bottom');
		const useBottom = preferBottom ? spaceAbove >= this._panelHeight : spaceBelow < this._panelHeight;

		if (useBottom) {
			// Panel appears above button
			bottom = viewportHeight - currentButtonY + this._gap + 'px';
		} else {
			// Panel appears below button
			top = currentButtonY + buttonHeight + this._gap + 'px';
		}

		if (useRight) {
			// Panel appears to the left of button (right-aligned)
			right = viewportWidth - currentButtonX - buttonWidth + 'px';
		} else {
			// Panel appears to the right of button (left-aligned)
			left = currentButtonX + 'px';
		}

		// Ensure panel doesn't go off-screen
		const styles: any = {
			position: 'fixed',
			width: this._panelWidth + 'px',
			height: this._panelHeight + 'px',
			top,
			right,
			bottom,
			left,
		};

		// Additional bounds checking
		if (left !== 'auto') {
			const leftValue = parseInt(left);
			if (leftValue + this._panelWidth > viewportWidth) {
				styles.left = Math.max(0, viewportWidth - this._panelWidth) + 'px';
			} else if (leftValue < 0) {
				styles.left = '0px';
			}
		}

		if (right !== 'auto') {
			const rightValue = parseInt(right);
			if (rightValue + this._panelWidth > viewportWidth) {
				styles.right = Math.max(0, viewportWidth - this._panelWidth) + 'px';
			} else if (rightValue < 0) {
				styles.right = '0px';
			}
		}

		return styles;
	});
}
