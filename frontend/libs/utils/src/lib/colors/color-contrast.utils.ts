export function getRGBValues(color: string) {
	// Create a temporary element
	const dummy = document.createElement('div');
	dummy.style.color = color;
	document.body.appendChild(dummy);

	// Get computed color in the format "rgb(r, g, b)" or "rgba(r, g, b, a)"
	const computedColor = window.getComputedStyle(dummy).color;
	document.body.removeChild(dummy);

	// Extract the RGB components
	const rgb = computedColor.match(/\d+/g);

	if (!rgb) {
		throw new Error('Invalid color');
	}

	return {
		r: parseInt(rgb[0], 10),
		g: parseInt(rgb[1], 10),
		b: parseInt(rgb[2], 10),
	};
}

export function getContrastingColor(color: string) {
	const { r, g, b } = getRGBValues(color);
	// Calculate brightness using a common formula
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	// Return black for bright colors, white for dark colors
	return brightness > 128 ? '#000000' : '#ffffff';
}

// // Example usage:
// const bgColor = 'hsl(210, 50%, 60%)'; // could also be a name like 'red' or a hex value
// const textColor = getContrastingColor(bgColor);
// console.log(textColor);
