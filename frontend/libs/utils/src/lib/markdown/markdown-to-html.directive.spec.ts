import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MarkdownToHtmlDirective } from './markdown-to-html.directive';

@Component({
	template: `<div [markdown-to-html]="content()"></div>`,
	imports: [MarkdownToHtmlDirective],
	standalone: true,
})
class TestHostComponent {
	content = signal<string | null | undefined>('');
}

describe('MarkdownToHtmlDirective', () => {
	it('renders markdown input to innerHTML', async () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.componentInstance.content.set('**bold**');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const el = fixture.debugElement.query(By.css('div'));
		expect(el.nativeElement.innerHTML).toContain('<strong>bold</strong>');
	});

	it('updates innerHTML when input changes', async () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.componentInstance.content.set('# Heading');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const el = fixture.debugElement.query(By.css('div'));
		expect(el.nativeElement.innerHTML).toContain('<h1>');

		fixture.componentInstance.content.set('**updated**');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		expect(el.nativeElement.innerHTML).toContain('<strong>updated</strong>');
	});

	it('does not leave script tags in innerHTML', async () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.componentInstance.content.set('<script>alert(1)</script>');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const el = fixture.debugElement.query(By.css('div'));
		expect(el.nativeElement.innerHTML).not.toContain('<script>');
	});

	it('handles null gracefully — sets innerHTML to empty', async () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.componentInstance.content.set(null);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const el = fixture.debugElement.query(By.css('div'));
		expect(el.nativeElement.innerHTML).toBe('');
	});

	it('handles undefined gracefully — sets innerHTML to empty', async () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.componentInstance.content.set(undefined);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const el = fixture.debugElement.query(By.css('div'));
		expect(el.nativeElement.innerHTML).toBe('');
	});
});
