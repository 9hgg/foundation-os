import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TeamsRepository } from '@foundation/teams/state';
import { of, throwError } from 'rxjs';
import { TeamJoinPageComponent } from './team-join-page.component';

describe('TeamJoinPageComponent', () => {
	const teamsRepositoryMock = {
		claimTeamInvitation$: vi.fn(),
	};
	const routerMock = {
		navigate: vi.fn(),
	};
	let queryParams: Record<string, string> = {};

	async function createComponent() {
		await TestBed.configureTestingModule({
			imports: [TeamJoinPageComponent],
			providers: [
				{ provide: TeamsRepository, useValue: teamsRepositoryMock },
				{ provide: Router, useValue: routerMock },
				{ provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
			],
			schemas: [NO_ERRORS_SCHEMA],
		}).compileComponents();

		const fixture = TestBed.createComponent(TeamJoinPageComponent);
		fixture.detectChanges();
		return fixture.componentInstance;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.resetTestingModule();
		queryParams = { token: 'team-1.secret' };
		teamsRepositoryMock.claimTeamInvitation$.mockReturnValue(of({ result: { teamId: 'team-1', teamName: 'Studio', role: 'admin' } }));
	});

	it('claims the token in the link as soon as the page opens', async () => {
		const component = await createComponent();

		expect(teamsRepositoryMock.claimTeamInvitation$).toHaveBeenCalledWith('team-1.secret');
		expect(component.isClaiming()).toBe(false);
		expect(component.joinedTeamName()).toBe('Studio');
		expect(component.joinedRole()).toBe('admin');
	});

	it('shows the refusal the backend gave rather than a generic one', async () => {
		teamsRepositoryMock.claimTeamInvitation$.mockReturnValue(
			of({ error: { title: 'Invitation is for another address', description: 'Sign in with the address this invitation was sent to' } })
		);

		const component = await createComponent();

		expect(component.joinedTeamId()).toBeNull();
		expect(component.errorTitle()).toBe('Invitation is for another address');
		expect(component.errorDescription()).toBe('Sign in with the address this invitation was sent to');
	});

	it('says what is missing when the link carried no token', async () => {
		queryParams = {};

		const component = await createComponent();

		expect(teamsRepositoryMock.claimTeamInvitation$).not.toHaveBeenCalled();
		expect(component.isClaiming()).toBe(false);
		expect(component.errorTitle()).toBe('Nothing to accept');
	});

	it('stops claiming when the request itself fails', async () => {
		teamsRepositoryMock.claimTeamInvitation$.mockReturnValue(throwError(() => new Error('offline')));

		const component = await createComponent();

		expect(component.isClaiming()).toBe(false);
		expect(component.errorTitle()).toBe('Something went wrong');
	});

	it('opens the team it just joined', async () => {
		const component = await createComponent();

		component.goToTeam();

		expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'teams', 'team-1', 'builder']);
	});
});
