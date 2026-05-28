import { Team, TeamConfig, Membership } from './team.model';

describe('Team model', () => {
	it('requires id and config fields', () => {
		const team: Team = { id: 'team-1', config: {} };
		expect(team.id).toBe('team-1');
		expect(team.config).toEqual({});
	});

	it('accepts optional name and ownerId', () => {
		const team: Team = { id: 't1', config: {}, name: 'Core', ownerId: 'user-1' };
		expect(team.name).toBe('Core');
		expect(team.ownerId).toBe('user-1');
	});

	it('TeamConfig can have optional details string', () => {
		const config: TeamConfig = { details: 'An important team' };
		expect(config.details).toBe('An important team');
	});

	it('TeamConfig can be empty', () => {
		const config: TeamConfig = {};
		expect(config.details).toBeUndefined();
	});

	it('Membership has userId, teamId, and role', () => {
		const m: Membership = { userId: 'u1', teamId: 't1', role: 'admin' };
		expect(m.userId).toBe('u1');
		expect(m.teamId).toBe('t1');
		expect(m.role).toBe('admin');
	});
});
