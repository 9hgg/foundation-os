import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { ProjectBasicDataType } from '@edf/edf-project-rands/models';
import { of } from 'rxjs';
import { ExtraPropertiesEditorComponent } from './extra-properties-editor.component';

vi.mock('uuid', () => ({ v4: () => 'property-uuid' }));

describe('ExtraPropertiesEditorComponent', () => {
	const buildFixture = () => {
		const confirm = vi.fn(() => ({ closed: of(true) }));

		TestBed.configureTestingModule({
			providers: [
				{ provide: NotificationService, useValue: { confirm } },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
			],
		});
		TestBed.overrideComponent(ExtraPropertiesEditorComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(ExtraPropertiesEditorComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		const changed = vi.fn();
		component.extraPropertiesChange.subscribe(changed);

		return { fixture, component, confirm, changed };
	};

	afterEach(() => TestBed.resetTestingModule());

	describe('entries', () => {
		it('lists the extra properties as id/value pairs', () => {
			const { fixture, component } = buildFixture();
			const props: Record<string, ProjectBasicDataType> = { p1: { key: 'k1', title: 'Prop 1', kind: 'text', content: 'x' } };
			fixture.componentRef.setInput('extraProperties', props);

			expect(component.entries()).toEqual([{ id: 'p1', value: props['p1'] }]);
		});

		it('is empty when there are no extra properties', () => {
			const { component } = buildFixture();
			expect(component.entries()).toEqual([]);
		});
	});

	describe('addProperty', () => {
		it('adds a property, deriving the key from the title when none is given', () => {
			const { component, changed } = buildFixture();
			component.newPropertyName.set('My New Field');
			component.newPropertyKind.set('textarea');

			component.addProperty();

			const [payload] = changed.mock.calls[0];
			const added = payload['property-uuid'];
			expect(added).toEqual({ title: 'My New Field', key: 'my_new_field', kind: 'textarea', content: '' });
		});

		it('uses the explicit key when provided', () => {
			const { component, changed } = buildFixture();
			component.newPropertyName.set('My Field');
			component.newPropertyKey.set('custom_key');

			component.addProperty();

			const [payload] = changed.mock.calls[0];
			expect(payload['property-uuid'].key).toBe('custom_key');
		});

		it('resets the editing signals after adding', () => {
			const { component } = buildFixture();
			component.newPropertyName.set('X');
			component.newPropertyKey.set('x');

			component.addProperty();

			expect(component.newPropertyName()).toBe('');
			expect(component.newPropertyKind()).toBe('text');
			expect(component.newPropertyKey()).toBe('');
		});

		it('does nothing when there is no key and no title to derive one from', () => {
			const { component, changed } = buildFixture();

			component.addProperty();

			expect(changed).not.toHaveBeenCalled();
		});
	});

	describe('removeProperty', () => {
		it('removes the property once confirmed', () => {
			const { fixture, component, confirm, changed } = buildFixture();
			fixture.componentRef.setInput('extraProperties', { p1: { key: 'k1', title: 'T', kind: 'text', content: '' } });

			component.removeProperty('p1');

			expect(confirm).toHaveBeenCalled();
			const [payload] = changed.mock.calls[0];
			expect(payload['p1']).toBeUndefined();
		});

		it('does nothing when not confirmed', () => {
			const { fixture, component, confirm, changed } = buildFixture();
			confirm.mockReturnValueOnce({ closed: of(false) });
			fixture.componentRef.setInput('extraProperties', { p1: { key: 'k1', title: 'T', kind: 'text', content: '' } });

			component.removeProperty('p1');

			expect(changed).not.toHaveBeenCalled();
		});
	});

	describe('updateProperty', () => {
		it('updates a single field of an existing property', () => {
			const { fixture, component, changed } = buildFixture();
			fixture.componentRef.setInput('extraProperties', { p1: { key: 'k1', title: 'T', kind: 'text', content: 'old' } });

			component.updateProperty('p1', 'content', 'new value');

			const [payload] = changed.mock.calls[0];
			expect(payload['p1']).toEqual({ key: 'k1', title: 'T', kind: 'text', content: 'new value' });
		});

		it('does nothing for an unknown property key', () => {
			const { component, changed } = buildFixture();

			component.updateProperty('missing', 'content', 'x');

			expect(changed).not.toHaveBeenCalled();
		});
	});
});
