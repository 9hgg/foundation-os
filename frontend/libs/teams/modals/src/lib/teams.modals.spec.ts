import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { TeamsModals } from './teams.modals';

describe('TeamsModals', () => {
	let modals: TeamsModals;
	let dialogMock: { open: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.clearAllMocks();
		dialogMock = { open: vi.fn().mockReturnValue({ closed: { subscribe: vi.fn() } }) };
		TestBed.configureTestingModule({
			providers: [
				TeamsModals,
				{ provide: Dialog, useValue: dialogMock },
			],
		});
		modals = TestBed.inject(TeamsModals);
	});

	it('openTeamsSelectionDialog opens the dialog', () => {
		modals.openTeamsSelectionDialog({ selectionConstraints: { single: true } });
		expect(dialogMock.open).toHaveBeenCalledOnce();
	});

	it('returns the dialog ref', () => {
		const ref = modals.openTeamsSelectionDialog({ selectionConstraints: { single: true } });
		expect(ref).toBeTruthy();
	});

	it('passes the modal data to the dialog', () => {
		const data = { selectionConstraints: { single: true, maxTeams: 2 }, filters: [] };
		modals.openTeamsSelectionDialog(data);
		const callArgs = dialogMock.open.mock.calls[0];
		expect(callArgs[1]).toMatchObject({ data });
	});
});
