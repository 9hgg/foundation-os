import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';

import { Component, inject, Input } from '@angular/core';
import { VideoBlotContextMenuService } from './video-menu.service';

@Component({
	selector: 'lib-video-menu',
	templateUrl: './video-menu.component.html',
	styleUrl: './video-menu.component.css',
	standalone: true,
	imports: [CdkMenuModule, CdkMenuItem, CdkMenuItem, CdkMenu],
})
export class VideoMenuComponent {
	@Input() data: any;

	_contextMenuService = inject(VideoBlotContextMenuService);
	constructor() {}

	onAction(action: string) {
		console.log(`[ContextMenu] Action "${action}" triggered with data:`, this.data);
		// Insert your custom logic based on the action here.

		// Close the context menu overlay once an action is triggered.
		this._contextMenuService.close(action);
	}
}
