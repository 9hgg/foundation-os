// Byte sizes, human readable, in binary units.
//
// The divisor is 1024, so the labels are KiB/MiB/GiB -- labelling a 1024-division
// "GB" is how 100 GiB once displayed as "99.98 GB" and read like a rounding bug.
// English units everywhere, including in the French apps (never "Go"), and one
// pipe with one output beats two that can drift apart.

import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
	name: 'octetHumanReadable',
	standalone: true,
})
export class OctetHumanReadablePipe implements PipeTransform {
	transform(value: number): string {
		if (!value) {
			return '0 B';
		}
		const k = 1024;
		const dm = 2;
		const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
		const i = Math.floor(Math.log(value) / Math.log(k));
		return parseFloat((value / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
	}
}
