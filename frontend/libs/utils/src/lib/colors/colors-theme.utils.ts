// import { TonalPalette, applyTheme, argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';
export const a = 2; // to avoid TS error
/**
 * Apply a color theme to an element
 * @param target
 * @param colorSource
 * @param enableDark
 * @param customColors
 *
 * ```ts
 * ngAfterViewInit() {
 *		const target = this._elementRef.nativeElement;
 *		applyColorTheme(target, '#123456');
 *	}
 * ```
 */
// export function applyColorTheme(
// 	target: HTMLElement,
// 	colorSource: string,
// 	enableDark: boolean = true,
// 	customColors: { name: string; colorHex: string; blend: boolean }[] = []
// ) {
// 	//
// 	// Get the theme from a hex color
// 	const theme = themeFromSourceColor(argbFromHex(colorSource), [
// 		...customColors.map(({ name, colorHex, blend }) => {
// 			return {
// 				name,
// 				value: argbFromHex(colorHex),
// 				blend,
// 			};
// 		}),
// 	]);
// 	// Print out the theme as JSON
// 	// console.log(JSON.stringify(theme, null, 2), theme);
// 	// Check if the user has dark mode turned on
// 	const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
// 	// Apply the theme to the body by updating custom properties for material tokens
// 	applyTheme(theme, { target, dark: enableDark && systemDark });
// }

// export function generateColorTheme(
// 	target: HTMLElement,
// 	colorSource: string,
// 	enableDark: boolean = true,
// 	customColors: { name: string; colorHex: string; blend: boolean }[] = []
// ) {
// 	// Get the theme from a hex color
// 	const theme = themeFromSourceColor(argbFromHex(colorSource), [
// 		...customColors.map(({ name, colorHex, blend }) => {
// 			return {
// 				name,
// 				value: argbFromHex(colorHex),
// 				blend,
// 			};
// 		}),
// 	]);

// 	const primaryPalette = TonalPalette.fromInt(argbFromHex(colorSource));
// 	const TONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
// 	const ALT_TONES = [100, 200, 400, 700];

// 	// Set primary tones
// 	TONES.forEach((tone) => {
// 		const toneValue = primaryPalette.tone(tone);
// 		const hexValue = hexFromArgb(toneValue);
// 		target.style.setProperty(`--default-${tone}`, hexValue);
// 		console.log(`--default-${tone}`, hexValue);
// 	});

// 	// Set accent tones
// 	ALT_TONES.forEach((tone) => {
// 		const toneValue = primaryPalette.tone(tone);
// 		const hexValue = hexFromArgb(toneValue);
// 		target.style.setProperty(`--default-A${tone}`, hexValue);
// 	});

// 	// Apply contrast colors
// 	[...TONES, ...ALT_TONES.map((t) => `A${t}`)].forEach((contrastTone) => {
// 		const toneValue = primaryPalette.tone(parseInt(contrastTone.toString().replace('A', ''), 10));
// 		const isLight = toneValue > 0x808080;
// 		target.style.setProperty(
// 			`--contrast-${contrastTone}`,
// 			isLight ? 'var(--light-primary-text)' : 'var(--dark-primary-text)'
// 		);
// 	});
// }
