import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectBasicDataType } from '@edf/edf-project-rands/models';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective, TranslationService } from '@foundation/translations/services';
import { v4 as uuidv4 } from 'uuid';
// export interface ProjectBasicDataType {
// 	key: string;
// 	title: string;
// 	kind: 'text' | 'textarea' | 'quill' | 'select' | 'multiselect' | 'date' | string;
// 	content: any;
// }

@Component({
	selector: 'lib-extra-properties-editor',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, QuillTextareaComponent],
	templateUrl: './extra-properties-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtraPropertiesEditorComponent {
	public extraProperties = input<Record<string, ProjectBasicDataType> | undefined>();
	public extraPropertiesChange = output<Record<string, ProjectBasicDataType>>();

	private _notificationService = inject(NotificationService);
	private _translationService = inject(TranslationService);

	public entries = computed(() => {
		return Object.entries(this.extraProperties() ?? {}).map(([id, projectData]) => ({ id, value: projectData }));
	});

	newPropertyName = signal('');
	newPropertyKind = signal<ProjectBasicDataType['kind']>('text');
	newPropertyKey = signal('');

	addProperty() {
		const title = this.newPropertyName().trim();
		const key = this.newPropertyKey().trim() || title.toLowerCase().replace(/\s+/g, '_');
		const kind = this.newPropertyKind();

		if (!key || !kind) {
			console.warn('[ExtraPropertiesEditor] Missing key or kind');
			return;
		}

		const props = { ...(this.extraProperties() ?? {}) };
		const propertyId = uuidv4();

		const newProps = { ...props, [propertyId]: { title, key, kind: kind as ProjectBasicDataType['kind'], content: '' } };

		this.extraPropertiesChange.emit(newProps);
		this.newPropertyName.set('');
		this.newPropertyKind.set('text');
		this.newPropertyKey.set('');
	}

	private _i18n_deleteExtraPropertyConfirm = this._translationService.prep('Are you sure you want to delete this property?');
	removeProperty(key: string) {
		this._notificationService.confirm(this._i18n_deleteExtraPropertyConfirm()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			const props = { ...(this.extraProperties() ?? {}) };
			delete props[key];
			this.extraPropertiesChange.emit(props);
		});
	}

	updateProperty(key: string, field: keyof ProjectBasicDataType, value: unknown) {
		console.log('[ExtraPropertiesEditor] updateProperty', { key, field, value });
		const props = { ...(this.extraProperties() ?? {}) };
		const current = props[key];
		if (!current) return;

		const newProps = { ...props, [key]: { ...current, [field]: value } };
		this.extraPropertiesChange.emit(newProps);
	}
}
