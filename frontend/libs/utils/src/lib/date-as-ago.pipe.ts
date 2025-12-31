import { Pipe, PipeTransform } from '@angular/core';
@Pipe({
	name: 'dateAsAgo',
	standalone: true,
})
export class DateAsAgoPipe implements PipeTransform {
	transform(value: Date | number | string | undefined, ...args: unknown[]): unknown {
		if (value instanceof Date) {
			value = value.getTime();
			// console.log('DateAsAgoPipe: value is a date:', value);
		}
		if (typeof value === 'string') {
			value = new Date(value).getTime();
		}

		if (!value) {
			return '';
		}
		let delta = (Date.now() - value) / 1000;
		if (delta < 0) delta = 0;

		if (delta < 60) {
			const secs = Math.floor(delta);
			return secs === 1 ? '1 second ago' : `${secs} seconds ago`;
		}
		if (delta < 3600) {
			const mins = Math.floor(delta / 60);
			const secs = Math.floor(delta % 60);
			let result = mins === 1 ? '1 minute' : `${mins} minutes`;
			if (secs > 0) result += secs === 1 ? ' 1 second' : ` ${secs} seconds`;
			return result + ' ago';
		}
		// 3600 * 24 = 86400 seconds in a day
		if (delta < 86400) {
			const hours = Math.floor(delta / 3600);
			const mins = Math.floor((delta % 3600) / 60);
			let result = hours === 1 ? '1 hour' : `${hours} hours`;
			if (mins > 0) result += mins === 1 ? ' 1 minute' : ` ${mins} minutes`;
			return result + ' ago';
		}
		if (delta < 2 * 86400) {
			const days = Math.floor(delta / 86400);
			const hours = Math.floor((delta % 86400) / 3600);

			let result = days === 1 ? '1 day' : `${days} days`;
			if (hours > 0) result += hours === 1 ? ' 1 hour' : ` ${hours} hours`;
			return result + ' ago';
		}
		// More than 3 days ago, show date
		return new Date(value).toLocaleString();
	}
}
