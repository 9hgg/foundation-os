import { TestBed } from '@angular/core/testing';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { of } from 'rxjs';
import { TeamPillComponent } from './team-pill.component';

const team: Team = { id: 'team-1', name: 'Research and development', config: {} };

describe('TeamPillComponent', () => {
	let repository: {
		store: {
			getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
		};
	};

	beforeEach(async () => {
		repository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn().mockReturnValue(of(team)),
			},
		};

		await TestBed.configureTestingModule({
			imports: [TeamPillComponent],
			providers: [{ provide: TeamsRepository, useValue: repository }],
		})
			.overrideComponent(TeamPillComponent, { set: { template: '' } })
			.compileComponents();
	});

	it('loads the team name from the team id input', () => {
		const fixture = TestBed.createComponent(TeamPillComponent);

		fixture.componentRef.setInput('teamId', 'team-1');
		fixture.detectChanges();

		expect(repository.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('team-1');
		expect(fixture.componentInstance.teamName()).toBe('Research and development');
	});

	it('uses the team input id when no explicit team id is provided', () => {
		const fixture = TestBed.createComponent(TeamPillComponent);

		fixture.componentRef.setInput('team', team);
		fixture.detectChanges();

		expect(repository.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('team-1');
	});

	it('falls back to a default name when the loaded team has no name', () => {
		repository.store.getObjectByIdPullOnce$$$.mockReturnValue(of({ id: 'team-2', config: {} }));
		const fixture = TestBed.createComponent(TeamPillComponent);

		fixture.componentRef.setInput('teamId', 'team-2');
		fixture.detectChanges();

		expect(fixture.componentInstance.teamName()).toBe('No title');
	});

	it('truncates the displayed name when it is longer than the max length', () => {
		const fixture = TestBed.createComponent(TeamPillComponent);
		const component = fixture.componentInstance;

		component.teamName.set('A very long team name');
		fixture.componentRef.setInput('maxLength', 6);
		fixture.detectChanges();

		expect(component.teamNameTruncated()).toBe('A very...');
	});

	it('keeps the full name when max length is null', () => {
		const fixture = TestBed.createComponent(TeamPillComponent);
		const component = fixture.componentInstance;

		component.teamName.set('A very long team name');
		fixture.componentRef.setInput('maxLength', null);
		fixture.detectChanges();

		expect(component.teamNameTruncated()).toBe('A very long team name');
	});

	it('completes cleanly on destroy', () => {
		const fixture = TestBed.createComponent(TeamPillComponent);

		expect(() => fixture.destroy()).not.toThrow();
	});
});
