// Helper function to retrieve the default computed style value for a given property
function getDefaultStyle(styleProp: keyof CSSStyleDeclaration) {
	const el = document.createElement('div');
	// Append to the document (using document.head here, but you could also use document.body)
	document.head.appendChild(el);
	const value = window.getComputedStyle(el)[styleProp];
	document.head.removeChild(el);
	return value;
}

// Cache default values so we don't have to recompute them every time.
export const DEFAULT_BACKGROUND = getDefaultStyle('backgroundColor') as string;
export const DEFAULT_TEXT_COLOR = getDefaultStyle('color') as string;

// Generic recursive function to get the inherited style value
function getInheritedStyle(el: HTMLElement, styleProp: keyof CSSStyleDeclaration, defaultValue: any) {
	const computedValue = window.getComputedStyle(el)[styleProp];
	// If a non-default value is found, return it
	if (computedValue !== defaultValue) return computedValue;
	// If there is no parent, return the default
	if (!el.parentElement) return defaultValue;
	// Recurse with the parent element
	return getInheritedStyle(el.parentElement, styleProp, defaultValue);
}

// Function to get inherited background color
export function getInheritedBackgroundColor(el: HTMLElement) {
	return getInheritedStyle(el, 'backgroundColor', DEFAULT_BACKGROUND);
}

// Function to get inherited text (foreground) color
export function getInheritedTextColor(el: HTMLElement): string {
	return getInheritedStyle(el, 'color', DEFAULT_TEXT_COLOR);
}
