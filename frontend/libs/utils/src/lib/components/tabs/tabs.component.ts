import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface TabItem {
	/** Stable value stored in `active` (and usually mirrored in the URL). */
	value: string;
	/** Already-translated label — this component is translation-free by design. */
	label: string;
	/** Optional count rendered as a badge next to the label. */
	badge?: number | string | null;
	/** Defaults to `tab-<value>`. */
	testId?: string;
}

/**
 * The segmented tab bar used by every builder page (Details/Sharing, Overview/Contacts/...).
 * Extracted here because the markup was duplicated in 15+ builder templates: change the look
 * once, every builder follows.
 */
@Component({
	selector: 'lib-tabs',
	standalone: true,
	imports: [],
	template: `
		<div class="bg-base-200 flex shrink-0 gap-1 overflow-x-auto rounded-lg p-1">
			@for (tab of tabs(); track tab.value) {
				<button
					type="button"
					[attr.data-testid]="tab.testId ?? 'tab-' + tab.value"
					class="hover:bg-base-100/50 flex cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200"
					[class.bg-base-100]="active() === tab.value"
					[class.shadow-sm]="active() === tab.value"
					[class.opacity-50]="active() !== tab.value"
					(click)="active.set(tab.value)"
				>
					{{ tab.label }}
					@if (tab.badge !== undefined && tab.badge !== null) {
						<span class="badge badge-xs">{{ tab.badge }}</span>
					}
				</button>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsComponent {
	tabs = input.required<TabItem[]>();
	active = model.required<string>();
}
