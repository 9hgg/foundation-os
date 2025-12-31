import { ChangeDetectionStrategy, Component, model } from '@angular/core';
const DEBUG = true;

@Component({
	selector: 'lib-separator',
	standalone: true,
	imports: [],
	templateUrl: './separator.component.html',
	styleUrl: './separator.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeparatorComponent {}
