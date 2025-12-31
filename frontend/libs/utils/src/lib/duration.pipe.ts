import { Pipe, PipeTransform } from '@angular/core';

export function toHoursMinutesSeconds(totalSeconds: number, args: unknown[]) {
	const showUnits = args.includes('showUnits');

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.round(totalSeconds % 60);
	let result = `${minutes.toString().padStart(1, '0')}:${seconds.toString().padStart(2, '0')}`;
	if (showUnits) {
		result = `${minutes.toString().padStart(1, '0')}mn${seconds.toString().padStart(2, '0')}s`;
	}

	if (hours) {
		result = `${hours.toString()}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		if (showUnits) {
			result = `${hours.toString()}h${minutes.toString().padStart(2, '0')}mn${seconds.toString().padStart(2, '0')}s`;
			if (minutes == 0 && seconds == 0) {
				result = `${hours.toString()}h`;
				// 	return `${hours}h`;
				// }
			}
		}
	}
	return result;
}

@Pipe({
	name: 'duration',
	standalone: true,
})
export class DurationPipe implements PipeTransform {
	/**
	 * Convert a duration in seconds into a human readable duration
	 * @param showUnits display time units
	 */
	transform(seconds: number, ...args: unknown[]): string {
		return toHoursMinutesSeconds(seconds, args);
	}
}
