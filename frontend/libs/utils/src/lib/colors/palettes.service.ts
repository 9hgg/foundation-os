import { Injectable } from '@angular/core';

export interface ColorPalette {
	id: number;
	colors: string[];
	name?: string;
}

@Injectable({ providedIn: 'root' })
export class PalettesService {
	private palettes: ColorPalette[] = [
		{ id: 0, colors: ['#69d2e7', '#a7dbd8', '#e0e4cc', '#f38630', '#fa6900'], name: 'Ocean Sunset' },
		{ id: 1, colors: ['#fe4365', '#fc9d9a', '#f9cdad', '#c8c8a9', '#83af9b'], name: 'Coral Dreams' },
		{ id: 2, colors: ['#ecd078', '#d95b43', '#c02942', '#542437', '#53777a'], name: 'Autumn Harvest' },
		{ id: 3, colors: ['#556270', '#4ecdc4', '#c7f464', '#ff6b6b', '#c44d58'], name: 'Vibrant Mix' },
		{ id: 4, colors: ['#774f38', '#e08e79', '#f1d4af', '#ece5ce', '#c5e0dc'], name: 'Earth Tones' },
		{ id: 5, colors: ['#e8ddcb', '#cdb380', '#036564', '#033649', '#031634'], name: 'Deep Ocean' },
		{ id: 6, colors: ['#490a3d', '#bd1550', '#e97f02', '#f8ca00', '#8a9b0f'], name: 'Bold Energy' },
		{ id: 7, colors: ['#594f4f', '#547980', '#45ada8', '#9de0ad', '#e5fcc2'], name: 'Natural Flow' },
		{ id: 8, colors: ['#00a0b0', '#6a4a3c', '#cc333f', '#eb6841', '#edc951'], name: 'Retro Pop' },
		{ id: 9, colors: ['#e94e77', '#d68189', '#c6a49a', '#c6e5d9', '#f4ead5'], name: 'Soft Romance' },
		{ id: 10, colors: ['#3fb8af', '#7fc7af', '#dad8a7', '#ff9e9d', '#ff3d7f'], name: 'Fresh Spring' },
		{ id: 11, colors: ['#d9ceb2', '#948c75', '#d5ded9', '#7a6a53', '#99b2b7'], name: 'Neutral Comfort' },
		{ id: 12, colors: ['#ffffff', '#cbe86b', '#f2e9e1', '#1c140d', '#cbe86b'], name: 'Clean Minimal' },
		{ id: 13, colors: ['#efffcd', '#dce9be', '#555152', '#2e2633', '#99173c'], name: 'Garden Fresh' },
		{ id: 14, colors: ['#343838', '#005f6b', '#008c9e', '#00b4cc', '#00dffc'], name: 'Electric Blue' },
		{ id: 15, colors: ['#413e4a', '#73626e', '#b38184', '#f0b49e', '#f7e4be'], name: 'Dusty Rose' },
		{ id: 16, colors: ['#ff4e50', '#fc913a', '#f9d423', '#ede574', '#e1f5c4'], name: 'Sunset Glow' },
		{ id: 17, colors: ['#99b898', '#fecea8', '#ff847c', '#e84a5f', '#2a363b'], name: 'Organic Blend' },
		{ id: 18, colors: ['#655643', '#80bca3', '#f6f7bd', '#e6ac27', '#bf4d28'], name: 'Earthy Rich' },
		{ id: 19, colors: ['#00a8c6', '#40c0cb', '#f9f2e7', '#aee239', '#8fbe00'], name: 'Tech Fresh' },
		{ id: 20, colors: ['#351330', '#424254', '#64908a', '#e8caa4', '#cc2a41'], name: 'Mysterious' },
		{ id: 21, colors: ['#554236', '#f77825', '#d3ce3d', '#f1efa5', '#60b99a'], name: 'Warm Spice' },
		{ id: 22, colors: ['#5d4157', '#838689', '#a8caba', '#cad7b2', '#ebe3aa'], name: 'Sage Garden' },
		{ id: 23, colors: ['#8c2318', '#5e8c6a', '#88a65e', '#bfb35a', '#f2c45a'], name: 'Forest Path' },
		{ id: 24, colors: ['#fad089', '#ff9c5b', '#f5634a', '#ed303c', '#3b8183'], name: 'Fire & Ice' },
	];

	/**
	 * Get all available palettes
	 */
	getAllPalettes(): ColorPalette[] {
		return this.palettes;
	}

	/**
	 * Get a specific palette by ID
	 */
	getPaletteById(id: number): ColorPalette | undefined {
		return this.palettes.find((palette) => palette.id === id);
	}

	/**
	 * Get a random palette
	 */
	getRandomPalette(): ColorPalette {
		const randomIndex = Math.floor(Math.random() * this.palettes.length);
		return this.palettes[randomIndex];
	}

	/**
	 * Get palettes that contain similar colors to the given hex color
	 */
	getSimilarPalettes(hexColor: string, maxResults: number = 10): ColorPalette[] {
		const targetColor = this.hexToRgb(hexColor);
		if (!targetColor) return [];

		const palettesWithDistance = this.palettes.map((palette) => {
			const minDistance = Math.min(
				...palette.colors.map((color) => {
					const paletteColor = this.hexToRgb(color);
					return paletteColor ? this.colorDistance(targetColor, paletteColor) : Infinity;
				})
			);
			return { palette, distance: minDistance };
		});

		return palettesWithDistance
			.sort((a, b) => a.distance - b.distance)
			.slice(0, maxResults)
			.map((item) => item.palette);
	}

	/**
	 * Search palettes by dominant color category (warm, cool, neutral)
	 */
	getPalettesByCategory(category: 'warm' | 'cool' | 'neutral'): ColorPalette[] {
		return this.palettes.filter((palette) => {
			const categoryCount = palette.colors.reduce((count, color) => {
				const colorCategory = this.getColorCategory(color);
				return colorCategory === category ? count + 1 : count;
			}, 0);
			// Return palettes where majority of colors match the category
			return categoryCount >= Math.ceil(palette.colors.length / 2);
		});
	}

	/**
	 * Convert hex color to RGB
	 */
	private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16),
				}
			: null;
	}

	/**
	 * Calculate distance between two RGB colors
	 */
	private colorDistance(color1: { r: number; g: number; b: number }, color2: { r: number; g: number; b: number }): number {
		return Math.sqrt(Math.pow(color1.r - color2.r, 2) + Math.pow(color1.g - color2.g, 2) + Math.pow(color1.b - color2.b, 2));
	}

	/**
	 * Determine if a color is warm, cool, or neutral
	 */
	private getColorCategory(hex: string): 'warm' | 'cool' | 'neutral' {
		const rgb = this.hexToRgb(hex);
		if (!rgb) return 'neutral';

		const { r, g, b } = rgb;

		// Simple heuristic:
		// Warm: red and yellow dominant
		// Cool: blue and green dominant
		// Neutral: balanced or grayscale
		if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30) {
			return 'neutral'; // Grayscale-ish
		}

		if (r > b && r + g > b * 1.5) {
			return 'warm';
		} else if (b > r && b + g > r * 1.5) {
			return 'cool';
		}

		return 'neutral';
	}
}
