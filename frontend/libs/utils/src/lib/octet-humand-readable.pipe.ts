// octet human readable pipe

import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
	name: 'octetHumanReadable',
	standalone: true,
})
export class OctetHumanReadablePipe implements PipeTransform {
	transform(value: number): string {
		if (value === 0) {
			return '0 octets';
		}
		const k = 1024;
		const dm = 2;
		const sizes = ['octets', 'ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];
		const i = Math.floor(Math.log(value) / Math.log(k));
		return parseFloat((value / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
	}
}
