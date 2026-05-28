import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserPillComponent } from './user-pill.component';
import { UsersRepository } from '@foundation/users/state';

const mockUsersRepository = {
        getUserPublicDetails$: vi.fn().mockReturnValue(of({ publicName: null, starredEmail: null })),
};

describe('UserPillComponent', () => {
        beforeEach(() => {
                TestBed.configureTestingModule({
                        imports: [UserPillComponent],
                        providers: [{ provide: UsersRepository, useValue: mockUsersRepository }],
                });
        });

        it('creates the component', () => {
                const fixture = TestBed.createComponent(UserPillComponent);
                expect(fixture.componentInstance).toBeTruthy();
        });

        it('userPublicNameTruncated defaults to "someone" when no user is set', () => {
                const fixture = TestBed.createComponent(UserPillComponent);
                fixture.detectChanges();
                expect(fixture.componentInstance.userPublicNameTruncated()).toBe('someone');
        });

        it('truncates userPublicName when it exceeds maxLength (default 30)', () => {
                const fixture = TestBed.createComponent(UserPillComponent);
                const comp = fixture.componentInstance;
                comp.userPublicName.set('A very long display name that definitely exceeds thirty chars');
                fixture.detectChanges();
                const truncated = comp.userPublicNameTruncated();
                expect(truncated.endsWith('...')).toBe(true);
                expect(truncated.length).toBeLessThanOrEqual(33); // 30 + '...'
        });

        it('does not truncate userPublicName when within maxLength', () => {
                const fixture = TestBed.createComponent(UserPillComponent);
                const comp = fixture.componentInstance;
                comp.userPublicName.set('Short name');
                fixture.detectChanges();
                expect(comp.userPublicNameTruncated()).toBe('Short name');
        });

        it('does not truncate when maxLength is null (unlimited)', () => {
                const fixture = TestBed.createComponent(UserPillComponent);
                const comp = fixture.componentInstance;
                fixture.componentRef.setInput('maxLength', null);
                comp.userPublicName.set('A very long display name that definitely exceeds thirty chars');
                fixture.detectChanges();
                expect(comp.userPublicNameTruncated()).toBe('A very long display name that definitely exceeds thirty chars');
        });

        it('sets userPublicName from resolved publicName when userId is provided', () => {
                mockUsersRepository.getUserPublicDetails$.mockReturnValue(of({ publicName: 'Resolved Name', starredEmail: null }));
                const fixture = TestBed.createComponent(UserPillComponent);
                fixture.componentRef.setInput('userId', 'user-abc');
                fixture.detectChanges();
                expect(fixture.componentInstance.userPublicName()).toBe('Resolved Name');
        });

        it('falls back to starredEmail when publicName is null', () => {
                mockUsersRepository.getUserPublicDetails$.mockReturnValue(of({ publicName: null, starredEmail: 'fallback@example.com' }));
                const fixture = TestBed.createComponent(UserPillComponent);
                fixture.componentRef.setInput('userId', 'user-xyz');
                fixture.detectChanges();
                expect(fixture.componentInstance.userPublicName()).toBe('fallback@example.com');
	});
});
