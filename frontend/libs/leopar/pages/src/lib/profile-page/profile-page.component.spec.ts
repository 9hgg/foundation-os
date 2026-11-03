import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { UsersRepository } from '@foundation/users/state';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { FileModals } from '@foundation/files/modals';
import { AppConfigService } from '@foundation/app/config';
import { ProfilePageComponent } from './profile-page.component';

describe('ProfilePageComponent', () => {
	let fixture: ComponentFixture<ProfilePageComponent>;
	let component: ProfilePageComponent;
	let fragment$: Subject<string | null>;

	beforeEach(async () => {
		fragment$ = new Subject<string | null>();

		await TestBed.configureTestingModule({
			imports: [ProfilePageComponent],
			providers: [
				provideRouter([]),
				{ provide: ActivatedRoute, useValue: { fragment: fragment$ } },
				{ provide: UsersRepository, useValue: { currentProfile: signal(null), refreshUsers: vi.fn() } },
				{ provide: RequestService, useValue: { post$: vi.fn().mockReturnValue(of({})) } },
				{ provide: NotificationService, useValue: { snackError: vi.fn(), snack: vi.fn(), snackSuccess: vi.fn() } },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'translated'), currentLangCode$$$: of('fr') } },
				{ provide: FileModals, useValue: { openFilesSelectionDialog: vi.fn().mockReturnValue({ closed: of(null) }) } },
				{ provide: AppConfigService, useValue: { config$_: { environment: { availableThemes: ['light', 'dark'] } } } },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(ProfilePageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		fixture = TestBed.createComponent(ProfilePageComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('creates the component', () => {
		expect(component).toBeTruthy();
	});

	it('scrolls the fragment target into view once the route fragment resolves', () => {
		vi.useFakeTimers();
		const target = document.createElement('div');
		target.id = 'irl-section';
		// jsdom doesn't implement scrollIntoView at all, so there's nothing for spyOn to wrap.
		const scrollSpy = vi.fn();
		target.scrollIntoView = scrollSpy;
		document.body.appendChild(target);

		component.ngOnInit();
		fragment$.next('irl-section');
		vi.advanceTimersByTime(100);

		expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
		document.body.removeChild(target);
		vi.useRealTimers();
	});

	it('does nothing when the fragment has no matching element', () => {
		vi.useFakeTimers();
		component.ngOnInit();

		expect(() => {
			fragment$.next('does-not-exist');
			vi.advanceTimersByTime(100);
		}).not.toThrow();
		vi.useRealTimers();
	});

	it('does nothing when the route resolves with no fragment', () => {
		component.ngOnInit();
		expect(() => fragment$.next(null)).not.toThrow();
	});
});
