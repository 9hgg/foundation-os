import { TemplatePortal } from '@angular/cdk/portal';
import { Directive, effect, ElementRef, HostBinding, inject, model, OnDestroy, Signal, signal, TemplateRef, untracked, viewChild, ViewContainerRef, WritableSignal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { Block, CanvasManager, CssUnits, ExportOption, Store } from '@foundation/canvas';
import { NotificationService } from '@foundation/notification';
import { Attr, createBehaviorSubjectProxy, isEqual, PortalService } from '@foundation/utils';
import { combineLatest, debounceTime, EMPTY, Observable, skip, Subject, switchMap, take, tap } from 'rxjs';

export interface InteractionRepositoryInterface {
	saveInteraction: (ownerId: string, datae: any[]) => void;

	/**
	 * All repository implementing this interface are responsible for interpreting the data (most of the converting it to a key/
	 * The data (once interpreted) will be used to get an interaction that the service can return (transformed or not)
	 *
	 * example:
	 * The interview repo is generating a key like this:
	 * ```
	 * const { interviewId, blockId, stepId, propertyId } = data;
	 * const propertyKey = `${interviewId}.${stepId}.${blockId}.${propertyId}`;
	 * const interactionKey = `interview.${interviewId}`;
	 * ```
	 *
	 * It gets the interaction for the key `interactionKey` and then it converts the interaction config to:
	 * ```
	 * const interactionValue = interaction.config[propertyKey]
	 * ```
	 *
	 * @param data
	 * @returns
	 */
	reloadInteractionValue$: (data: any) => Observable<any>;
	reloadInteractionValue: (interaction: any, data: any) => any;
}

export interface Area {
	id: string;
	name: string;
	targetBlockId: string | null;
}

@Directive()
export class MotherComponent implements OnDestroy {
	private _interactionRepository: InteractionRepositoryInterface | null = null;
	protected _notificationService = inject(NotificationService);
	private _portalService = inject(PortalService);
	private _viewContainerRef = inject(ViewContainerRef);
	public el = inject(ElementRef);

	/** If true, the block can't be selected, moved, edited, etc... */
	passive = signal<boolean>(false);
	/** If true, no "Interaction" can be synced for this block */
	preventInteraction = signal<boolean>(false);

	// host binding on touch action
	@HostBinding('style.touch-action') touchAction = 'none';

	static getDefaultExportOptions(): ExportOption<any>[] {
		const idOption: ExportOption<'uuidv4'> = {
			id: 'block-id',
			kind: 'uuidv4',
			title: 'block identifier',
			description: 'This option will give you the block id. The block id is a unique identifier for the block. <br/>In particular, it is a 32 character long string of (almost) random letters and numbers.',
			perInteraction: false,
			fn: (stepId, block) => {
				return block.id;
			},
		};
		const blockDataOption: ExportOption<'json'> = {
			id: 'block-raw-data-as-json',
			kind: 'json',
			title: 'block raw data',
			description: "This option will give you the block data as a JSON object. <br/>This is quite technical and may not be very useful if you don't plan on using it through programmatic approaches.",
			perInteraction: false,
			fn: (stepId, block) => {
				return block;
			},
		};

		return [idOption, blockDataOption];
	}

	static getExportOptions(): ExportOption<any>[] {
		return [];
	}

	/** internal data representation of the block (for custom properties support) */
	øblockDataStore$_ = createBehaviorSubjectProxy<Block['data']>({});
	/** will be changed by enlisted signals for interaction and will forward info to the interaction repository */
	øblockInteractionDataStore$_ = createBehaviorSubjectProxy<Attr>({});

	/** block data representation (not block.data but block itself) (for block properties like width, color, etc...)
	 *
	 * If edited: it will be forwarded to the interview.
	 *
	 * It is initialized in setSignalsFromInterviewStore using blockDetails getter
	 *
	 */
	block$_ = createBehaviorSubjectProxy({} as Block);
	/**
	 * block interaction data representation (for interaction properties like hover, click, textAnswer, etc...)
	 *
	 * If edited: it will be forward to the interaction through the interview repository and then to the interaction repository.
	 *
	 * It is initialized through setSignalsFromInteractionStore
	 */
	// blockInteraction$_ = createBehaviorSubjectProxy({} as Block);

	private _propertyKeysToSync: string[] = [];
	private _interactionKeysToSync: string[] = [];
	blockDataLoaded = false;
	/** Reference to the canvas object
	 * canvas, and canvasId/blockId before that, are set by the interview builder page when using the renderer
	 */
	private _canvasManager: CanvasManager | null = null;

	ownerId: string | null = null;

	selectedBlock$ = new Subject<Observable<string | null>>();

	canvasState$ = new Subject<
		Observable<{
			store: Store;
			currentCanvasId: string | null;
			selectedBlockId: string | null;
		}>
	>();

	public get canvasManager(): CanvasManager | null {
		return this._canvasManager;
	}
	public set canvasManager(value: CanvasManager | null) {
		this._canvasManager = value;
		if (!this._canvasManager || !this.stepId || !this.blockId) return;
		this.canvasState$.next(this._canvasManager.state$_.$);
		this.selectedBlock$.next(this._canvasManager.state$_.selectedBlockId$);
	}

	/** selection state based on DADCanvas (if another block is selected it will be unselected) */
	blockIsSelected = signal(false);

	blockId: string | null = null;
	stepId: string | null = null;

	get blockDetails(): Block | null {
		if (!this._canvasManager || !this.stepId || !this.blockId) {
			return null;
		}
		return this._canvasManager.getCopyOfBlockById(this.stepId, this.blockId);
	}

	get blockInteractionDetails(): Block | null {
		if (!this._canvasManager || !this.stepId || !this.blockId) {
			return null;
		}
		// todo: get interaction from interaction repo/store
		return null;
	}

	// TOOLBAR THROUGH PORTAL
	toolbarPortalTpl = viewChild<TemplateRef<unknown>>('toolbarPortalTpl');

	// help signal on width and height
	width = model<number | null>(null);
	widthUnits = model<CssUnits>();
	height = model<number | null>(null);
	heightUnits = model<CssUnits>();
	posX = model<number | null>(null);
	posXUnits = model<CssUnits>();
	posY = model<number | null>(null);
	posYUnits = model<CssUnits>();

	constructor() {
		// BLOCK.DATA component (local) to canvas store (class)
		this.øblockDataStore$_.$.pipe(
			//
			takeUntilDestroyed(),
			skip(1),
			debounceTime(300),
			tap((øblockData: Block['data']) => {
				// is passive : do not update the block data
				if (this.passive()) {
					// console.log('øblockData not updated because the component is passive:', øblockData);
					return;
				}
				console.log('øblockData:', øblockData);

				if (!this._canvasManager || !this.stepId || !this.blockId) {
					console.log('canvas block data not updated because the canvas or canvasId or blockId is not set:', {
						canvasId: this.stepId ? 'set' : 'not set',
						blockId: this.blockId ? 'set' : 'not set',
						canvas: this._canvasManager ? 'set' : 'not set',
					});
					return;
				}
				// don't update the block data if it's not loaded yet
				if (!this.blockDataLoaded) {
					console.log('canvas block data not updated because the angular component has not been filled with previously saved values:', øblockData);
					return;
				}

				const currentBlock = this._canvasManager.getCopyOfBlockById(this.stepId, this.blockId);
				if (!currentBlock) {
					console.log('canvas block data not updated because the block is not found in the canvas:', {
						stepId: this.stepId,
						blockId: this.blockId,
					});
					return;
				}
				if (isEqual(currentBlock.data, øblockData)) {
					console.log('øblockData not updated because it is the same as the block data', øblockData);

					return;
				}
				const newBlockData: Block['data'] = { ...currentBlock.data, ...øblockData };
				const newBlock: Block = { ...currentBlock, data: newBlockData };

				this._canvasManager.setBlock(this.stepId, this.blockId, newBlock);
				console.log('øblockData updated:', øblockData);
			})
		).subscribe();

		// BLOCK component (local) to canvas store (class)
		// Used in template to directly update the block data
		this.block$_.$.pipe(
			takeUntilDestroyed(),
			skip(1),
			debounceTime(300),
			tap((block) => {
				// is passive : do not update the block data
				if (this.passive()) {
					// console.log('block data not updated because the component is passive:', data);
					return;
				}

				this.width.set(block.width);
				this.widthUnits.set(block.widthUnits);
				this.height.set(block.height);
				this.heightUnits.set(block.heightUnits);
				this.posX.set(block.posX);
				this.posXUnits.set(block.posXUnits);
				this.posY.set(block.posY);
				this.posYUnits.set(block.posYUnits);

				this.setBlockProperties(block);
			})
		).subscribe();

		// INTERACTION.DATA component (local) to interaction store (class)
		this.øblockInteractionDataStore$_.$.pipe(
			//
			takeUntilDestroyed(),
			skip(1),
			debounceTime(300),
			tap((øblockInteractionData: Attr) => {
				// is passive : do not update the block data
				if (this.passive()) {
					console.log('interaction data not updated because the component is passive:', øblockInteractionData);
					return;
				}
				if (this.preventInteraction()) {
					console.log('interaction data not updated because interaction is prevented:', øblockInteractionData);
					return;
				}

				const blockId = this.blockId;
				const stepId = this.stepId;
				const ownerId = this.ownerId; // interviewId when using interview builder

				if (!blockId || !stepId || !ownerId) {
					console.log('interaction data not updated because blockId or stepId or interviewId is not set:', {
						blockId: blockId ? 'set' : 'not set',
						stepId: stepId ? 'set' : 'not set',
						interviewId: ownerId ? 'set' : 'not set',
					});
					return;
				}

				this._interactionRepository?.saveInteraction(
					ownerId,
					Object.entries(øblockInteractionData).map(([propertyId, value]) => {
						return { blockId, stepId, propertyId, value };
					})
				);
			})
		).subscribe();

		// BLOCK selection state
		this.selectedBlock$
			.pipe(
				takeUntilDestroyed(),
				switchMap((obs) => obs),
				tap((selectedBlockId) => {
					// if passive, do not process the selection
					if (this.passive()) {
						return;
					}

					if (selectedBlockId == this.blockId) {
						this.blockIsSelected.set(true);
					} else {
						this.blockIsSelected.set(false);
					}
				})
			)
			.subscribe();

		effect(() => {
			const width = this.width();
			if (width && this.block$_.width !== width) {
				this.block$_.width = width;
			}
			const height = this.height();
			if (height && this.block$_.height !== height) {
				this.block$_.height = height;
			}
		});
		effect(() => {
			const widthUnits = this.widthUnits();
			if (widthUnits && this.block$_.widthUnits !== widthUnits) {
				this.block$_.widthUnits = widthUnits;
			}
			const heightUnits = this.heightUnits();
			if (heightUnits && this.block$_.heightUnits !== heightUnits) {
				this.block$_.heightUnits = heightUnits;
			}

			const posX = this.posX();
			if (posX && this.block$_.posX !== posX) {
				this.block$_.posX = posX;
			}
			const posXUnits = this.posXUnits();
			if (posXUnits && this.block$_.posXUnits !== posXUnits) {
				this.block$_.posXUnits = posXUnits;
			}
			const posY = this.posY();
			if (posY && this.block$_.posY !== posY) {
				this.block$_.posY = posY;
			}
			const posYUnits = this.posYUnits();
			if (posYUnits && this.block$_.posYUnits !== posYUnits) {
				this.block$_.posYUnits = posYUnits;
			}
		});

		// Keep block$ in sync with the canvas manager state
		this.canvasState$
			.pipe(
				takeUntilDestroyed(),
				switchMap((obs) => obs),
				tap((state) => {
					if (!this._canvasManager || !this.stepId || !this.blockId) {
						return;
					}
					const block = this._canvasManager.getCopyOfBlockById(this.stepId, this.blockId);
					if (!block) {
						return;
					}

					const same = isEqual(this.block$_._, block);
					if (same) {
						return;
					}

					this.setAllEnlistedSignalFromStoredBlock();
					// Object.assign(this.block$_, block);
				})
			)
			.subscribe();

		// dispay toolbar based on block selected or not
		effect(() => {
			const blockIsSelected = this.blockIsSelected();

			// when not editing: clear the toolbar
			if (blockIsSelected) {
				this._addToolbarToBody();
			} else {
				this._removeToolbarFromItsParent();
			}
		});

		// enlist the toolbar ng template to make it accessible to the interview builder
		effect(() => {
			const toolbarPortalTpl = this.toolbarPortalTpl();
			const blockId = this.blockId;

			if (!toolbarPortalTpl || !blockId) {
				return;
			}
			const portal = new TemplatePortal(toolbarPortalTpl, this._viewContainerRef);
			this._portalService.updatePortal('toolbar-' + blockId, portal);
		});
	}

	ngOnDestroy() {
		this._removeToolbarFromItsParent();
		this.destructor();
	}

	/**
	 * Destructor method to be overridden by the child class, called by ngOnDestroy
	 */
	destructor() {
		// to be overridden
	}

	enlistInteractionArea() {
		//
	}

	tranformBlock(cb: (block: Block) => Block, redraw: boolean = false) {
		// console.log('[Mother](tranformBlock)');

		if (!this._canvasManager || !this.stepId || !this.blockId) {
			return;
		}

		const currentBlock = this._canvasManager.getCopyOfBlockById(this.stepId, this.blockId);
		if (!currentBlock) {
			console.warn('Block not found in canvas:', { stepId: this.stepId, blockId: this.blockId });
			return;
		}
		const newBlockData = cb(currentBlock);
		this._canvasManager.setBlock(this.stepId, this.blockId, newBlockData);
	}

	setBlockProperties(properties: Partial<Block>) {
		this.tranformBlock((block) => {
			const newBlock: Block = {
				...block,
				...properties,
			};
			return newBlock;
		}, true);
	}

	// INTERVIEW

	/**
	 * Enlist the signal to sync with the component store
	 * By binding the signal to the component store, the signal will
	 * be updated when the component store is updated and vice versa
	 * @param signal
	 * @returns
	 */
	enlistSignalForBlockStorage(signal: WritableSignal<any>) {
		// signal to component store

		// get key from variable "signal" directly through javascript
		const key = Object.keys(this).find((k) => {
			const k_ = k as keyof this;
			return this[k_] === signal;
		});

		if (!key) {
			console.error('key not found automatically', signal, key);
			return;
		}

		this._propertyKeysToSync.push(key);

		toObservable(signal)
			.pipe(
				takeUntilDestroyed(),
				skip(1),
				tap((value) => {
					this.øblockDataStore$_[key] = value;
				})
			)
			.subscribe();
	}

	private _setSignalFromStoredBlock(signal_: WritableSignal<any> | Signal<any>, key: string) {
		// dad canvas store to signal
		if (!this._canvasManager || !this.stepId || !this.blockId) {
			return;
		}

		const block = this._canvasManager.getCopyOfBlockById(this.stepId, this.blockId);
		if (!block) {
			return;
		}
		// check if the key exists in the block data
		// sensible to "False" values
		// if (!block.data[key]) {
		// 	return;
		// }
		if (block.data[key] === undefined) {
			return;
		}

		const value = block.data[key];

		if (signal_() === value) {
			return;
		}
		if (value === undefined) {
			return;
		}

		// check if 'set' property exists in the signal (WritableSignal vs ComputedSignal)
		if ('set' in signal_) {
			signal_.set(value);
			return;
		}
	}

	/**
	 * Set signals first value from the canvas manager store
	 * Called by the builder/displayer when instantiating the component
	 */
	public setAllEnlistedSignalFromStoredBlock() {
		this._propertyKeysToSync.forEach((key) => {
			const _key = key as keyof this;
			if (!this[_key]) {
				return;
			}
			const signal = this[_key] as unknown as WritableSignal<any>;
			this._setSignalFromStoredBlock(signal, key);
		});

		const block = this.blockDetails;
		if (!block) {
			return;
		}
		Object.assign(this.block$_, block);
	}

	// INTERACTION

	/**
	 * Enlist the signal to sync with the component store
	 * By binding the signal to the component store, the signal will
	 * be updated when the component store is updated and vice versa
	 * @param signal
	 * @returns
	 */
	enlistSignalForInteractionStorage(signal: WritableSignal<any> | Signal<any>) {
		// signal to component store

		// get signal name directly through javascript
		const signalName = Object.keys(this).find((k) => {
			const k_ = k as keyof this;
			return this[k_] === signal;
		});

		if (!signalName) {
			console.error('signal name not found automatically', signal, signalName);
			return;
		}
		this._interactionKeysToSync.push(signalName);

		toObservable(signal)
			.pipe(
				takeUntilDestroyed(),
				skip(1),
				tap((value) => {
					this.øblockInteractionDataStore$_[signalName] = value;
				})
			)
			.subscribe();
	}

	private _setSignalFromInteractionStore$(signal: WritableSignal<any> | Signal<any>, key: string) {
		const blockId = this.blockId;
		const stepId = this.stepId;
		const interviewId = this.ownerId;

		if (!blockId || !stepId || !interviewId) {
			console.log('[Mother](_setSignalFromInteractionStore)', key, 'interaction data not loaded because blockId or stepId or interviewId is not set:', {
				blockId: blockId ? 'set' : 'not set',
				stepId: stepId ? 'set' : 'not set',
				interviewId: interviewId ? 'set' : 'not set',
			});
			return EMPTY;
		}

		if (!('set' in signal)) {
			// useful for 'computed' signals that could still be synced 'client->server'
			return EMPTY;
		}

		return (
			this._interactionRepository
				?.reloadInteractionValue$({
					blockId,
					stepId,
					interviewId,
					propertyId: key,
				})
				.pipe(
					take(1),
					tap((value) => {
						if (signal() === value) {
							return;
						}
						if (value === undefined) {
							return;
						}
						signal.set(value);
					})
				) ?? EMPTY
		);
	}

	interactionsLoaded$ = new Subject<void>();

	/**
	 * Called once at instantiation.
	 * The constructor was alreaedy called, hence the signals are already set with their default values and their keys are enlisted
	 * in the _interactionKeysToSync array.
	 * Set signals first from the interaction store
	 * Called by the interview builder/displayer when instantiating the component
	 */
	public setSignalsFromInteractionStore(interactionRepository: InteractionRepositoryInterface) {
		this._interactionRepository = interactionRepository;
		const interactionReloadings$ = this._interactionKeysToSync.map((key) => {
			const _key = key as keyof this;
			if (!this[_key]) {
				return EMPTY;
			}
			const signal = this[_key] as unknown as Signal<any>;
			return this._setSignalFromInteractionStore$(signal, key);
		});

		combineLatest(interactionReloadings$)
			.pipe(
				tap(() => {
					this.interactionsLoaded$.next();
				})
			)
			.subscribe();
	}

	down() {
		if (!this.canvasManager || !this.stepId || !this.blockId) return;
		this.canvasManager.layerDown(this.stepId, this.blockId);
	}

	up() {
		if (!this.canvasManager || !this.stepId || !this.blockId) return;
		this.canvasManager.layerUp(this.stepId, this.blockId);
	}

	// TOOLBAR

	toolbar: HTMLDivElement | null = null;
	toolbarTpl = viewChild<ElementRef<HTMLTemplateElement>>('toolbarTpl');
	_addToolbarToBody() {
		// using a portal
		const toolbarPortalTpl = untracked(this.toolbarPortalTpl);
		if (!toolbarPortalTpl || !this.blockId) {
			console.warn('toolbarPortalTpl or blockId not available');
			return;
		}
		this._portalService.updatePortal('builder-toolbar-' + this.blockId, new TemplatePortal(toolbarPortalTpl, this._viewContainerRef));
	}

	private _removeToolbarFromItsParent() {
		this._portalService.updatePortal('builder-toolbar-' + this.blockId, null);
	}

	public t(text: string) {
		return text;
	}
}
