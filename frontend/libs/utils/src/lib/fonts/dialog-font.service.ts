import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { Component, ComponentRef, EventEmitter, Injectable, Injector, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, map, startWith, switchMap } from 'rxjs/operators';
import { GoogleFontService } from './google-font.service';

const MAX_FONT_TO_DISPLAY = 20;

@Component({
	selector: 'lib-font-dialog',
	template: `
		<div class="font-dialog">
			<h2>Select a Font</h2>
			<input
				type="text"
				placeholder="Search fonts..."
				(input)="onSearch($event)"
			/>
			<ul>
				<li
					*ngFor="let font of filteredFonts()"
					[style.fontFamily]="font"
					(click)="selectFont(font)"
				>
					{{ font }}
				</li>
			</ul>
			<button
				class="close-btn"
				(click)="closeDialog()"
			>
				Close
			</button>
		</div>
	`,
	styles: [
		`
			.font-dialog {
				background: #fff;
				padding: 20px;
				width: 300px;
				box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
				border-radius: 4px;
			}
			input {
				width: 100%;
				margin-bottom: 10px;
			}
			ul {
				max-height: 200px;
				overflow-y: auto;
				padding: 0;
				margin: 0;
				list-style: none;
			}
			li {
				margin: 5px 0;
				cursor: pointer;
				transition: background-color 0.2s;
			}
			li:hover {
				background-color: #f0f0f0;
			}
			.close-btn {
				display: block;
				margin: 10px auto 0;
				padding: 5px 10px;
				background: #007bff;
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
			}
			.close-btn:hover {
				background: #0056b3;
			}
		`,
	],
	imports: [CommonModule],
	standalone: true,
})
export class FontDialogComponent implements OnInit, OnDestroy {
	@Output() fontSelected = new EventEmitter<string>();
	@Output() dialogClosed = new EventEmitter<void>();

	private searchTerm$ = new Subject<string>();
	filteredFonts = signal<string[]>([]);
	private allFonts: string[] = [];
	private destroy$ = new Subject<void>();

	constructor(private googleFontService: GoogleFontService) {}

	ngOnInit(): void {
		this.googleFontService
			.getFonts()
			.pipe(
				switchMap((fonts) => {
					this.allFonts = fonts.map((f) => f.family);
					return this.searchTerm$.pipe(
						startWith(''),
						debounceTime(300),
						map((term) => this.filterFonts(term))
					);
				})
			)
			.subscribe((filtered) => {
				this.filteredFonts.set(filtered);
			});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	onSearch(event: Event) {
		const input = event.target as HTMLInputElement;
		this.searchTerm$.next(input.value);
	}

	selectFont(font: string): void {
		this.fontSelected.emit(font);
		this.closeDialog();
	}

	closeDialog(): void {
		this.dialogClosed.emit();
	}

	private _levenshteinDistance(a: string, b: string): number {
		const an = a.length;
		const bn = b.length;
		if (an === 0) {
			return bn;
		}
		if (bn === 0) {
			return an;
		}
		const matrix = new Array<number[]>(bn + 1);
		for (let i = 0; i <= bn; ++i) {
			let row = (matrix[i] = new Array<number>(an + 1));
			row[0] = i;
		}
		const firstRow = matrix[0];
		for (let j = 1; j <= an; ++j) {
			firstRow[j] = j;
		}
		for (let i = 1; i <= bn; ++i) {
			for (let j = 1; j <= an; ++j) {
				if (b.charAt(i - 1) === a.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] =
						Math.min(
							matrix[i - 1][j - 1], // substitution
							matrix[i][j - 1], // insertion
							matrix[i - 1][j] // deletion
						) + 1;
				}
			}
		}
		return matrix[bn][an];
	}

	private filterFonts(term: string): string[] {
		if (!term) {
			return this.allFonts.slice(0, MAX_FONT_TO_DISPLAY);
		}

		console.log('term', term);

		term = term.toLowerCase();
		const results = this.allFonts
			// .filter((f) => f.toLowerCase().includes(term))
			.sort((a, b) => {
				// return this._levenshteinDistance(a, term) - this._levenshteinDistance(b, term);
				const aStartsWith = a.toLowerCase().startsWith(term);
				const bStartsWith = b.toLowerCase().startsWith(term);
				// if (aStartsWith) console.log("(a)",a, 'starts with', term);
				// if (bStartsWith) console.log("(b)",b, 'starts with', term);

				if (aStartsWith && !bStartsWith) return -1;
				if (bStartsWith && !aStartsWith) return 1;
				return this._levenshteinDistance(a, term) - this._levenshteinDistance(b, term) || a.localeCompare(b);
			})
			.slice(0, MAX_FONT_TO_DISPLAY);

		results.forEach((f) => this.googleFontService.addFontToHtml(f));
		return results;
	}
}

@Injectable({ providedIn: 'root' })
export class FontDialogService {
	private overlayRef: OverlayRef | null = null;

	constructor(
		private overlay: Overlay,
		private injector: Injector
	) {}

	open(onFontSelected: (font: string) => void): void {
		if (this.overlayRef) {
			this.close();
		}

		const overlayRef = this.overlay.create({
			hasBackdrop: true,
			backdropClass: 'cdk-overlay-dark-backdrop',
			positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
		});

		const portal = new ComponentPortal(FontDialogComponent, null, this.injector);
		const componentRef: ComponentRef<FontDialogComponent> = overlayRef.attach(portal);

		componentRef.instance.fontSelected.subscribe((font: string) => {
			onFontSelected(font);
			this.close();
		});

		componentRef.instance.dialogClosed.subscribe(() => {
			this.close();
		});

		overlayRef.backdropClick().subscribe(() => this.close());

		this.overlayRef = overlayRef;
	}

	close(): void {
		if (this.overlayRef) {
			this.overlayRef.dispose();
			this.overlayRef = null;
		}
	}
}
