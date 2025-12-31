import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';

import { Component, inject, Input } from '@angular/core';
import { ImageBlotContextMenuService } from './image-menu.service';

@Component({
	selector: 'lib-image-menu',
	templateUrl: './image-menu.component.html',
	styleUrl: './image-menu.component.css',
	standalone: true,
	imports: [CdkMenuModule, CdkMenuItem, CdkMenuItem, CdkMenu],
})
export class ImageMenuComponent {
	@Input() data: any;

	_contextMenuService = inject(ImageBlotContextMenuService);
	constructor() {}

	onAction(action: string) {
		console.log(`[ContextMenu] Action "${action}" triggered with data:`, this.data);
		// Insert your custom logic based on the action here.

		// Close the context menu overlay once an action is triggered.
		this._contextMenuService.close(action);
	}
}
