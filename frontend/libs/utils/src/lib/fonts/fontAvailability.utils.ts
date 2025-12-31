function isFontAvailable(font: string): boolean {
	// Create a canvas to measure font availability
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

	if (!context) return false;

	// ignore monospace, system-ui, sans-serif, etc fonts
	if (['monospace', 'system-ui', 'sans-serif', 'serif', 'cursive', 'fantasy', 'ui-monospace', 'ui-sans-serif', 'ui-serif', 'ui-rounded', 'ui-monospace', 'emoji', 'math', 'fangsong' /* Chinese serif */, 'ui-small-caps', 'inherit', 'initial', 'revert', 'revert-layer', 'unset'].includes(font)) return true;

	const text = 'abcdefghijklmnopqrstuvwxyz0123456789';
	context.font = '72px monospace';
	const baselineWidth = context.measureText(text).width;

	context.font = `72px '${font}', monospace`;
	const testWidth = context.measureText(text).width;

	return testWidth !== baselineWidth;
}

export function checkLocalStylesheetsForMissingFonts(): void {
	const styleSheets = Array.from(document.styleSheets);
	console.log('Checking local stylesheets for missing fonts:', styleSheets);

	styleSheets.forEach((sheet) => {
		try {
			if (sheet.cssRules) {
				Array.from(sheet.cssRules).forEach((rule) => {
					if (rule instanceof CSSStyleRule && rule.style.fontFamily) {
						const familyFonts = rule.style.fontFamily.split(',').map((f) => f.trim().replace(/['"]+/g, ''));
						let oneFontAvailableInFamily = false;
						let availableFont: string | undefined = undefined;
						for (const font of familyFonts) {
							if (isFontAvailable(font)) {
								oneFontAvailableInFamily = true;
								availableFont = font;
								break;
							}
						}

						if (!oneFontAvailableInFamily) {
							console.log(`%c🚫 No font available in the system for this family`, 'color: red', familyFonts);
						} else {
							console.log(`%c✅ Font available in the system: ${availableFont}`, 'color: green', familyFonts);
						}
					}
				});
			}
		} catch (e) {
			console.warn('Error accessing stylesheet rules:', e);
		}
	});
}
