import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject, of } from 'rxjs';
import { ContributorsBuilderPageComponent } from './contributor-builder-page.component';

describe('ContributorsBuilderPageComponent', () => {
	let getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let applyPatch: ReturnType<typeof vi.fn>;
	let paramMap$: BehaviorSubject<{ get: (key: string) => string | null }>;

	// The route id drives PatchableItem's effect during construction, so both the route value and
	// the repository mock must already be in place before TestBed.createComponent()/detectChanges().
	const buildComponent = (contributorId: string | null = null, contributor: Contributor | null = null) => {
		paramMap$ = new BehaviorSubject({ get: (key: string) => (key === 'contributorId' ? contributorId : null) });
		getObjectByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(contributor) });
		applyPatch = vi.fn();

		TestBed.configureTestingModule({
			imports: [ContributorsBuilderPageComponent],
			providers: [
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
				{ provide: NotificationService, useValue: {} },
				{ provide: ContributorsRepository, useValue: { store: { getObjectByIdPullOnce$$$, applyPatch } } },
			],
		});
		TestBed.overrideComponent(ContributorsBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(ContributorsBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture };
	};

	const patchOf = (component: ContributorsBuilderPageComponent) => component.patchableContributor.itemPatch$$$.value;

	afterEach(() => {
		vi.useRealTimers();
		TestBed.resetTestingModule();
	});

	it('starts with no contributor when the route carries no id', () => {
		const { component } = buildComponent();

		expect(component.contributorId()).toBeNull();
		expect(component.contributor()).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('loads the contributor named by the route', () => {
		const { component } = buildComponent('contributor-1', { id: 'contributor-1', firstName: 'Ada', lastName: 'Lovelace' } as Contributor);

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-1');
		expect(component.contributor()).toEqual({ id: 'contributor-1', firstName: 'Ada', lastName: 'Lovelace' });
	});

	it('shows nothing when the store has no contributor for the id', () => {
		const { component } = buildComponent('missing-id', null);

		expect(component.contributor()).toBeNull();
	});

	it('reflects an edited field immediately in the merged view, without saving yet', () => {
		const { component } = buildComponent('contributor-1', { id: 'contributor-1', firstName: 'Ada', lastName: 'Lovelace' } as Contributor);

		component.patchableContributor.updateField('firstName', 'Grace');

		expect(component.contributor()?.firstName).toBe('Grace');
		expect(component.contributor()?.lastName).toBe('Lovelace');
		expect(patchOf(component)).toEqual({ firstName: 'Grace' });
		expect(applyPatch).not.toHaveBeenCalled();
	});

	it('merges a nested field edit under its parent path', () => {
		const { component } = buildComponent('contributor-1', { id: 'contributor-1', firstName: 'Ada', config: { groupManager: 'Old' } } as Contributor);

		component.patchableContributor.updateField('config.groupManager', 'New Manager');

		expect((component.contributor()?.config as { groupManager?: string })?.groupManager).toBe('New Manager');
	});

	it('saves the pending patch after the debounce settles, against the id being edited', () => {
		vi.useFakeTimers();
		try {
			const { component } = buildComponent('contributor-1', { id: 'contributor-1', firstName: 'Ada' } as Contributor);

			component.patchableContributor.updateField('firstName', 'Grace');
			expect(applyPatch).not.toHaveBeenCalled();
			vi.advanceTimersByTime(500);

			expect(applyPatch).toHaveBeenCalledWith('contributor-1', { firstName: 'Grace' });
		} finally {
			vi.useRealTimers();
		}
	});

	it('reloads and drops any pending local edit when the route moves to a different contributor', () => {
		const { component, fixture } = buildComponent('contributor-1', { id: 'contributor-1', firstName: 'Ada' } as Contributor);
		component.patchableContributor.updateField('firstName', 'Grace');
		expect(component.contributor()?.firstName).toBe('Grace');

		getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'contributor-2', firstName: 'Bob' } as Contributor) });
		paramMap$.next({ get: (key) => (key === 'contributorId' ? 'contributor-2' : null) });
		fixture.detectChanges();

		expect(component.contributorId()).toBe('contributor-2');
		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-2');
		expect(component.contributor()).toEqual({ id: 'contributor-2', firstName: 'Bob' });
		expect(patchOf(component)).toEqual({});
	});
});
