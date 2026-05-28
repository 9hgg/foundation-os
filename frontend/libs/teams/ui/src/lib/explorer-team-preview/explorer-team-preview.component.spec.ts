import { TestBed } from '@angular/core/testing';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { UsersRepository } from '@foundation/users/state';
import { of } from 'rxjs';
import { ExplorerTeamPreviewComponent } from './explorer-team-preview.component';

const team: Team = {
	id: 'team-1',
	name: 'Core team',
	config: { details: 'Keeps the project moving' },
	ownerId: 'user-1',
};

describe('ExplorerTeamPreviewComponent', () => {
	let teamsRepository: {
		getTeamWithMembersAndRoles$: ReturnType<typeof vi.fn>;
	};
	let usersRepository: {
		getUserPublicDetails$: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		teamsRepository = {
			getTeamWithMembersAndRoles$: vi.fn().mockReturnValue(
				of({
					result: {
						members: [
							{
								user: {
									id: 'user-1',
									email: 'owner@example.com',
									firstName: 'Ada',
									lastName: 'Lovelace',
									profilePictureId: '12345678-1234-1234-1234-123456789abc',
								},
								role: 'admin',
							},
							{
								user: {
									id: 'user-2',
									pseudo: 'Builder',
								},
								role: 'reader',
							},
						],
					},
				})
			),
		};
		usersRepository = {
			getUserPublicDetails$: vi.fn().mockReturnValue(of({ publicName: 'Ada Lovelace', starredEmail: 'a***@example.com' })),
		};

		await TestBed.configureTestingModule({
			imports: [ExplorerTeamPreviewComponent],
			providers: [
				{ provide: TeamsRepository, useValue: teamsRepository },
				{ provide: UsersRepository, useValue: usersRepository },
			],
		}).compileComponents();
	});

	it('loads members and owner details when a team is provided', () => {
		const fixture = TestBed.createComponent(ExplorerTeamPreviewComponent);

		fixture.componentRef.setInput('resource', team);
		fixture.detectChanges();

		const component = fixture.componentInstance;
		expect(teamsRepository.getTeamWithMembersAndRoles$).toHaveBeenCalledWith('team-1');
		expect(usersRepository.getUserPublicDetails$).toHaveBeenCalledWith('user-1');
		expect(component.isLoadingMembers()).toBe(false);
		expect(component.ownerLabel()).toBe('Ada Lovelace');
		expect(component.teamMembers()).toHaveLength(2);
	});

	it('builds member display data with names, initials, avatars, and owner marker', () => {
		const fixture = TestBed.createComponent(ExplorerTeamPreviewComponent);
		fixture.componentRef.setInput('resource', team);
		fixture.detectChanges();

		const displays = fixture.componentInstance.teamMemberDisplays();

		expect(displays[0]).toEqual(
			expect.objectContaining({
				id: 'user-1',
				displayName: 'Ada Lovelace',
				secondaryLabel: 'owner@example.com',
				initials: 'AL',
				role: 'admin',
				isOwner: true,
			})
		);
		expect(displays[0].avatarUrl).toContain('/api/files/storage/read/12345678-1234-1234-1234-123456789abc/thumbnail');
		expect(displays[1]).toEqual(
			expect.objectContaining({
				id: 'user-2',
				displayName: 'Builder',
				secondaryLabel: 'user-2',
				initials: 'B',
				role: 'reader',
				isOwner: false,
				avatarUrl: null,
			})
		);
	});

	it('clears members and owner label when the resource is cleared', () => {
		const fixture = TestBed.createComponent(ExplorerTeamPreviewComponent);
		fixture.componentRef.setInput('resource', team);
		fixture.detectChanges();

		fixture.componentRef.setInput('resource', null);
		fixture.detectChanges();

		const component = fixture.componentInstance;
		expect(component.teamMembers()).toEqual([]);
		expect(component.ownerLabel()).toBeNull();
	});
});
