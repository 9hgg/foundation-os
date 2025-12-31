import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
	name: 'newlinesToBr',
	standalone: true,
})
export class NewlinesToBrPipe implements PipeTransform {
	transform(value: string | null | undefined): string {
		if (!value) {
			return '';
		}

		// Convert various newline formats to <br> tags
		return value
			.replace(/\r\n/g, '<br>') // Windows line endings
			.replace(/\n/g, '<br>') // Unix line endings
			.replace(/\r/g, '<br>'); // Mac line endings
	}
}
