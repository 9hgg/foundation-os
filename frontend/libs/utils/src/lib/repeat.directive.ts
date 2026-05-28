import { computed, Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';

@Directive({ selector: '[repeatTpl]', standalone: true })
export class RepeatDirective {
	private readonly _vcr = inject(ViewContainerRef);

	readonly repeatTpl = input.required<TemplateRef<unknown>>();
	readonly repeatCount = input<number>(0);

	private readonly _count = computed(() => Math.max(0, Math.floor(this.repeatCount())));

	constructor() {
		effect(() => {
			const tpl = this.repeatTpl();
			const count = this._count();
			this._vcr.clear();
			for (let i = 0; i < count; i++) {
				this._vcr.createEmbeddedView(tpl, { $implicit: i });
			}
		});
	}
}
