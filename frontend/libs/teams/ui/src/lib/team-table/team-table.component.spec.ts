import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FoldersModals } from '@foundation/folders/modals';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TeamsRepository } from '@foundation/teams/state';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { BehaviorSubject, of } from 'rxjs';
import { TeamTableComponent } from './team-table.component';

const emptyPage = {
	data: [],
	totalCount: 0,
	page: 1,
	hasNext: false,
	hasPrev: false,
	self: '',
	all: '',
	next: '',
	prev: '',
};

describe('TeamTableComponent', () => {
	let component: TeamTableComponent;
	let teamsRepository: {
		store: {
			getObjects$: ReturnType<typeof vi.fn>;
			getObjectById$$$: ReturnType<typeof vi.fn>;
			putObject$: ReturnType<typeof vi.fn>;
			deleteObject$: ReturnType<typeof vi.fn>;
		};
		goToTeam: ReturnType<typeof vi.fn>;
	};
	let foldersModals: {
		openFolderSelectionDialog: ReturnType<typeof vi.fn>;
	};
	let notificationService: {
		prompt: ReturnType<typeof vi.fn>;
		confirm: ReturnType<typeof vi.fn>;
	};
	let requestService: {
		clearCache$: BehaviorSubject<void>;
		getBasic$: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		teamsRepository = {
			store: {
				getObjects$: vi.fn().mockReturnValue(of(emptyPage)),
				getObjectById$$$: vi.fn().mockReturnValue({ $: of(null) }),
				putObject$: vi.fn().mockReturnValue(of({})),
				deleteObject$: vi.fn().mockReturnValue(of({})),
			},
			goToTeam: vi.fn(),
		};
		foldersModals = {
			openFolderSelectionDialog: vi.fn().mockReturnValue({ closed: of({ folders: [] }) }),
		};
		notificationService = {
			prompt: vi.fn().mockReturnValue({ closed: of(null) }),
			confirm: vi.fn().mockReturnValue({ closed: of(false) }),
		};
		requestService = {
			clearCache$: new BehaviorSubject<void>(undefined),
			getBasic$: vi.fn().mockReturnValue(of({})),
		};

		await TestBed.configureTestingModule({
			imports: [TeamTableComponent],
			providers: [
				{ provide: TeamsRepository, useValue: teamsRepository },
				{ provide: FoldersModals, useValue: foldersModals },
				{ provide: RequestService, useValue: requestService },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: TranslationService, useValue: { prep: vi.fn((value: string) => () => value) } },
				{ provide: Router, useValue: { navigate: vi.fn() } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}), snapshot: { queryParams: {} } } },
				{ provide: DragAndDropService, useValue: {} },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(TeamTableComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		component = TestBed.createComponent(TeamTableComponent).componentInstance;
	});

	it('creates with a repository-backed paginator request', () => {
		expect(component).toBeTruthy();
		component.requestFn(1, 20, [], { fieldName: 'name', direction: 'asc' }, true).subscribe();
		expect(teamsRepository.store.getObjects$).toHaveBeenCalledWith(1, 20, [], { fieldName: 'name', direction: 'asc' }, true, undefined);
	});

	it('renames a team when prompt returns a value', () => {
		notificationService.prompt.mockReturnValue({ closed: of({ value: 'New name' }) });
		vi.spyOn(component.paginator, 'refresh').mockReturnValue(of(emptyPage));

		component.renameTeam({ id: 'team-1', name: 'Old name', config: {} });

		expect(notificationService.prompt).toHaveBeenCalledWith('Give it a new name:', 'Old name');
		expect(teamsRepository.store.putObject$).toHaveBeenCalledWith({ id: 'team-1', name: 'New name', config: {} });
	});

	it('does not rename when prompt is cancelled or empty', () => {
		component.renameTeam({ id: 'team-1', name: 'Old name', config: {} });
		notificationService.prompt.mockReturnValue({ closed: of({ value: '' }) });
		component.renameTeam({ id: 'team-1', name: 'Old name', config: {} });

		expect(teamsRepository.store.putObject$).not.toHaveBeenCalled();
	});

	it('deletes a team when confirmed', () => {
		notificationService.confirm.mockReturnValue({ closed: of(true) });
		vi.spyOn(component.paginator, 'refresh').mockReturnValue(of(emptyPage));

		component.deleteTeam({ id: 'team-1', name: 'Team', config: {} });

		expect(notificationService.confirm).toHaveBeenCalledWith('Are you sure you want to delete this team?', 'Team', { confirmButtonText: 'Delete' });
		expect(teamsRepository.store.deleteObject$).toHaveBeenCalledWith('team-1');
	});

	it('does not delete when confirmation is rejected', () => {
		component.deleteTeam({ id: 'team-1', name: 'Team', config: {} });

		expect(teamsRepository.store.deleteObject$).not.toHaveBeenCalled();
	});

	it('delegates team navigation to the repository', () => {
		component.goToTeam('team-1');

		expect(teamsRepository.goToTeam).toHaveBeenCalledWith('team-1');
	});

	it('adds the team to the selected folder', () => {
		foldersModals.openFolderSelectionDialog.mockReturnValue({ closed: of({ folders: [{ id: 'folder-1' }] }) });

		component.openFolderSelectionModalFor({ id: 'team-1', name: 'Team', config: {} });

		expect(foldersModals.openFolderSelectionDialog).toHaveBeenCalled();
		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/add/team/team-1');
	});

	it('does not call the folder endpoint when no folder is selected', () => {
		component.openFolderSelectionModalFor({ id: 'team-1', name: 'Team', config: {} });

		expect(requestService.getBasic$).not.toHaveBeenCalled();
	});
});
