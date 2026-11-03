import { TestBed } from '@angular/core/testing';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { ContributorPillComponent } from './contributor-pill.component';

describe('ContributorPillComponent', () => {
	const buildFixture = (loaded: unknown = { id: 'contributor-1', firstName: 'Ada', lastName: 'Lovelace' }) => {
		const contributor$ = new BehaviorSubject<unknown>(loaded);
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: contributor$ }));

		TestBed.configureTestingModule({ providers: [{ provide: ContributorsRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(ContributorPillComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(ContributorPillComponent);
		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$, contributor$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('keeps the default name until it is told which contributor to show', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
		expect(component.contributorPublicName()).toBe('someone');
	});

	it('loads the full name of the contributor named by id', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-1');
		expect(component.contributorPublicName()).toBe('Ada Lovelace');
	});

	it('resolves the id from the contributor object when no contributorId is given', () => {
		const { fixture, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('contributor', { id: 'contributor-2', firstName: 'Grace', lastName: 'Hopper' });
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-2');
	});

	it('falls back to the email when the contributor has no name', () => {
		const { fixture, component } = buildFixture({ id: 'contributor-1', email: 'ada@example.test' });
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		expect(component.contributorPublicName()).toBe('ada@example.test');
	});

	it('falls back to the id when the contributor has neither a name nor an email', () => {
		const { fixture, component } = buildFixture({ id: 'contributor-1' });
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		expect(component.contributorPublicName()).toBe('contributor-1');
	});

	it('truncates a name longer than the maximum', () => {
		const { fixture, component } = buildFixture({ id: 'contributor-1', firstName: 'a'.repeat(40), lastName: '' });
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('maxLength', 10);
		fixture.detectChanges();

		expect(component.contributorPublicNameTruncated()).toBe('aaaaaaaaaa...');
	});

	it('leaves a short name alone, and leaves any name alone without a maximum', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();
		expect(component.contributorPublicNameTruncated()).toBe('Ada Lovelace');

		fixture.componentRef.setInput('maxLength', null);
		fixture.detectChanges();
		expect(component.contributorPublicNameTruncated()).toBe('Ada Lovelace');
	});

	it('stops listening once destroyed', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		expect(() => component.ngOnDestroy()).not.toThrow();
	});
});
