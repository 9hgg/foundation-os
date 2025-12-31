import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

export type CardTheme = 'blue' | 'gray' | 'yellow' | 'green' | 'red';
export type CardIcon = 'book' | 'mail' | 'warning' | 'info' | 'check' | 'custom';
export type CardVariant = 'clickable' | 'static' | 'interactive';

@Component({
	selector: 'lib-card',
	standalone: true,
	imports: [],
	templateUrl: './card.component.html',
	styleUrl: './card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
	// Inputs
	theme = input<CardTheme>('blue');
	icon = input<CardIcon>('book');
	variant = input<CardVariant>('clickable');

	// Model inputs
	displayButton = model<boolean>(false);

	// Outputs
	emit = output();
	cardClick = output<void>();
	buttonClick = output<void>();

	// Computed CSS classes based on theme
	containerClasses = computed(() => {
		const theme = this.theme();
		const variant = this.variant();

		const baseClasses = 'mx-6 mb-6 rounded-xl border-l-4 p-4 shadow';

		const themeClasses = {
			blue: 'border-blue-400 bg-blue-50',
			gray: 'border-gray-400 bg-gray-50',
			yellow: 'border-yellow-400 bg-yellow-50',
			green: 'border-green-400 bg-green-50',
			red: 'border-red-400 bg-red-50',
		};

		const interactionClasses = variant === 'clickable' || variant === 'interactive' ? 'cursor-pointer transition-colors duration-200' : '';

		const hoverClasses = variant === 'clickable' || variant === 'interactive' ? this.getHoverClass() : '';

		return `${baseClasses} ${themeClasses[theme]} ${interactionClasses} ${hoverClasses}`.trim();
	});

	iconClasses = computed(() => {
		const theme = this.theme();
		const themeColors = {
			blue: 'text-blue-500',
			gray: 'text-gray-500',
			yellow: 'text-yellow-500',
			green: 'text-green-500',
			red: 'text-red-500',
		};
		return `mr-3 h-6 w-6 flex-shrink-0 ${themeColors[theme]}`;
	});

	titleClasses = computed(() => {
		const theme = this.theme();
		const themeColors = {
			blue: 'text-blue-800',
			gray: 'text-gray-800',
			yellow: 'text-yellow-800',
			green: 'text-green-800',
			red: 'text-red-800',
		};
		return `font-semibold ${themeColors[theme]}`;
	});

	descriptionClasses = computed(() => {
		const theme = this.theme();
		const themeColors = {
			blue: 'text-blue-700',
			gray: 'text-gray-700',
			yellow: 'text-yellow-700',
			green: 'text-green-700',
			red: 'text-red-700',
		};
		return `mt-1 text-sm ${themeColors[theme]}`;
	});

	buttonClasses = computed(() => {
		const theme = this.theme();
		const themeColors = {
			blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
			gray: 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500',
			yellow: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
			green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
			red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
		};
		return `mt-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${themeColors[theme]}`;
	});

	private getHoverClass(): string {
		const theme = this.theme();
		const hoverClasses = {
			blue: 'hover:bg-blue-100',
			gray: 'hover:bg-gray-100',
			yellow: 'hover:bg-yellow-100',
			green: 'hover:bg-green-100',
			red: 'hover:bg-red-100',
		};
		return hoverClasses[theme];
	}

	onCardClick(): void {
		if (this.variant() === 'clickable' || this.variant() === 'interactive') {
			this.emit.emit();
			this.cardClick.emit();
		}
	}

	onButtonClick(event: Event): void {
		event.stopPropagation();
		this.emit.emit();
		this.buttonClick.emit();
	}

	getIconPath(): string {
		const icons = {
			book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
			mail: 'M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
			warning: 'M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z',
			info: 'M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z',
			check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
			custom: '', // Will be handled by ng-content projection
		};
		return icons[this.icon()];
	}
}
