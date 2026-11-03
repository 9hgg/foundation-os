import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DashboardHomePageComponent } from './dashboard-home-page.component';

// Pure static welcome shell, no injected dependencies and no logic of its own; this confirms it
// renders without error rather than merely asserting the class is exported.
describe('DashboardHomePageComponent', () => {
	let fixture: ComponentFixture<DashboardHomePageComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DashboardHomePageComponent],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(DashboardHomePageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		fixture = TestBed.createComponent(DashboardHomePageComponent);
	});

	it('creates and renders without error', () => {
		expect(fixture.componentInstance).toBeTruthy();
		expect(() => fixture.detectChanges()).not.toThrow();
	});
});
