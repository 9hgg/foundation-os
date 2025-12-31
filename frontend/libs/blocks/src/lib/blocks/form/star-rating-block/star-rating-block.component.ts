import { ExportOption } from '@foundation/canvas';
import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-star-rating-block',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './star-rating-block.component.html',
	styleUrl: './star-rating-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingBlockComponent extends MotherComponent implements OnDestroy {
	rating = signal<number>(0);
	hoverRating = signal<number>(0);
	label = signal<string>('Rate your experience');
	maxStars = signal<number>(5);

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'number'> = {
			id: 'star-rating-as-number',
			kind: 'number',
			title: 'as Number',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the star rating as a number (1-5)',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return 0;
				const interviewId = ownerId;
				const propertyId = 'rating';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const value = interaction.config[propertyKey];
				return Number(value) || 0;
			},
		};

		const b: ExportOption<'string'> = {
			id: 'star-rating-as-text',
			kind: 'string',
			title: 'as Text',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export the star rating as descriptive text',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return 'No rating';
				const interviewId = ownerId;
				const ratingPropertyKey = `${interviewId}.${step.id}.${block.id}.rating`;
				const maxStarsPropertyKey = `${interviewId}.${step.id}.${block.id}.maxStars`;
				const rating = Number(interaction.config[ratingPropertyKey]) || 0;
				const maxStars = Number(interaction.config[maxStarsPropertyKey]) || 5;

				if (rating === 0) return 'No rating';

				const descriptions = {
					1: 'Poor',
					2: 'Fair',
					3: 'Good',
					4: 'Very Good',
					5: 'Excellent',
				};

				const description = descriptions[rating as keyof typeof descriptions] || '';
				return `${rating} star${rating > 1 ? 's' : ''} - ${description}`;
			},
		};

		const c: ExportOption<'string'> = {
			id: 'star-rating-as-stars',
			kind: 'string',
			title: 'as Stars',
			activeByDefault: false,
			displayedByDefault: true,
			description: 'Export the star rating as star symbols',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return '☆☆☆☆☆';
				const interviewId = ownerId;
				const ratingPropertyKey = `${interviewId}.${step.id}.${block.id}.rating`;
				const maxStarsPropertyKey = `${interviewId}.${step.id}.${block.id}.maxStars`;
				const rating = Number(interaction.config[ratingPropertyKey]) || 0;
				const maxStars = Number(interaction.config[maxStarsPropertyKey]) || 5;

				return '★'.repeat(rating) + '☆'.repeat(maxStars - rating);
			},
		};

		return [a, b, c];
	}

	constructor() {
		super();
		this.enlistSignalForInteractionStorage(this.rating);
		this.enlistSignalForBlockStorage(this.label);
		this.enlistSignalForBlockStorage(this.maxStars);
	}

	onStarClick(starIndex: number): void {
		if (this.canvasManager?.editorMode === 'edit') return;
		this.rating.set(starIndex);
	}

	onStarHover(starIndex: number): void {
		if (this.canvasManager?.editorMode === 'edit') return;
		this.hoverRating.set(starIndex);
	}

	onStarLeave(): void {
		if (this.canvasManager?.editorMode === 'edit') return;
		this.hoverRating.set(0);
	}

	onLabelChange(event: Event): void {
		const target = event.target as HTMLElement;
		this.label.set(target.textContent || 'Rate your experience');
	}

	getStarArray(): number[] {
		return Array.from({ length: this.maxStars() }, (_, i) => i + 1);
	}

	isStarFilled(starIndex: number): boolean {
		const currentRating = this.hoverRating() || this.rating();
		return starIndex <= currentRating;
	}

	getRatingText(): string {
		const rating = this.rating();
		const maxStars = this.maxStars();
		return rating > 0 ? `${rating} out of ${maxStars} stars` : '';
	}
}
