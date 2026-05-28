import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DefaultWorkspacePageComponent } from './default-workspace-page.component';

describe('DefaultWorkspacePageComponent', () => {
        beforeEach(() => {
                TestBed.configureTestingModule({
                        imports: [DefaultWorkspacePageComponent],
                        providers: [provideRouter([])],
                });
        });

        it('creates the component', () => {
                const fixture = TestBed.createComponent(DefaultWorkspacePageComponent);
                fixture.detectChanges();
                expect(fixture.componentInstance).toBeTruthy();
        });

        it('renders a router-outlet element', () => {
                const fixture = TestBed.createComponent(DefaultWorkspacePageComponent);
                fixture.detectChanges();
                const outlet = fixture.debugElement.query(By.css('router-outlet'));
                expect(outlet).toBeTruthy();
	});
});
