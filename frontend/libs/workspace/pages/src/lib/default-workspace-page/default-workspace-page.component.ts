import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
	selector: 'lib-default-workspace-page',
	standalone: true,
	imports: [RouterModule],
	templateUrl: './default-workspace-page.component.html',
	styleUrls: ['./default-workspace-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultWorkspacePageComponent {}
