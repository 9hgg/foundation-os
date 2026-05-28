import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TeamsRepository } from '@foundation/teams/state';
import { UsersRepository } from '@foundation/users/state';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { of } from 'rxjs';
import { TeamListPageComponent } from './team-list-page.component';

describe('TeamListPageComponent', () => {
	let component: TeamListPageComponent;
	const teamsRepositoryMock = {
		createNewTeam$: vi.fn(),
		goToTeam: vi.fn(),
	};
	const routerMock = {
		navigateByUrl: vi.fn(),
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		teamsRepositoryMock.createNewTeam$.mockReturnValue(of(null));

		await TestBed.configureTestingModule({
			imports: [TeamListPageComponent],
			providers: [
				{ provide: TeamsRepository, useValue: teamsRepositoryMock },
				{ provide: Router, useValue: routerMock },
				{ provide: UsersRepository, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: vi.fn(), translate$: vi.fn() } },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(TeamListPageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		const fixture = TestBed.createComponent(TeamListPageComponent);
		component = fixture.componentInstance;
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('navigates to the created team from wrapped result data', () => {
		teamsRepositoryMock.createNewTeam$.mockReturnValue(of({ result: { team_id: 'team-1' } }));

		component.createNewTeam();

		expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/host/dashboard/teams/team-1/builder');
	});

	it('delegates team navigation to the repository', () => {
		component.goToTeam('team-1');

		expect(teamsRepositoryMock.goToTeam).toHaveBeenCalledWith('team-1');
	});
});
