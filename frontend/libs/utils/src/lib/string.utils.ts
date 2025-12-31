export function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0, len = str.length; i < len; i++) {
		const chr = str.charCodeAt(i);
		hash = (hash << 5) - hash + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash.toString();
}

/**
 * Remove dashes from a UUID and convert the resulting 32-char
 * hex string into a Uint8Array of 16 bytes.
 */
function uuidToByteArray(uuid: string): Uint8Array {
	// Remove dashes
	const hexStr = uuid.replace(/-/g, '');

	// Safety check (UUID hex is always 32 chars)
	if (hexStr.length !== 32) {
		throw new Error('Invalid UUID length: ' + hexStr.length);
	}

	const byteArray = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		// Parse each pair of hex characters
		byteArray[i] = parseInt(hexStr.substr(i * 2, 2), 16);
	}
	return byteArray;
}

/**
 * Convert a Uint8Array to a standard Base64 string (with + and /).
 */
function byteArrayToBase64(bytes: Uint8Array): string {
	let binaryString = '';
	for (let i = 0; i < bytes.length; i++) {
		// Convert each byte to a character
		binaryString += String.fromCharCode(bytes[i]);
	}
	// Encode the string in base64
	return btoa(binaryString);
}

/**
 * Convert a UUID to a standard Base64 string.
 */
export function uuidToBase64(uuid: string): string {
	const byteArray = uuidToByteArray(uuid);
	return byteArrayToBase64(byteArray).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function slugify(string: string) {
	const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;';
	const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------';
	const p = new RegExp(a.split('').join('|'), 'g');

	return string
		.toString()
		.toLowerCase()
		.replace(/\s+/g, '-') // Replace spaces with -
		.replace(p, (c) => b.charAt(a.indexOf(c))) // Replace special characters
		.replace(/&/g, '-and-') // Replace & with 'and'
		.replace(/[^\w-]+/g, '') // Remove all non-word characters
		.replace(/--+/g, '-') // Replace multiple - with single -
		.replace(/^-+/, '') // Trim - from start of text
		.replace(/-+$/, ''); // Trim - from end of text
}
