import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { of, Subject } from 'rxjs';
import { DurationIndicatorComponent } from './duration-indicator.component';

const file: EntityFile = {
	id: 'file-1',
	inStorage: true,
	extra: { duration: 42 },
	config: {},
};

describe('DurationIndicatorComponent', () => {
	let getObjectById$$$: ReturnType<typeof vi.fn>;

	const build = () => {
		TestBed.configureTestingModule({
			imports: [DurationIndicatorComponent],
			providers: [{ provide: FilesRepository, useValue: { store: { getObjectById$$$ } } }],
		});
		return TestBed.createComponent(DurationIndicatorComponent);
	};

	beforeEach(() => {
		getObjectById$$$ = vi.fn().mockReturnValue({ $: of(null) });
	});

	it('does not fetch anything without an entityFileId', () => {
		const fixture = build();
		fixture.detectChanges();

		expect(getObjectById$$$).not.toHaveBeenCalled();
		expect(fixture.componentInstance.fileDuration()).toBe(0);
	});

	it('fetches the file once an entityFileId is set and sets its extra duration', () => {
		const source = new Subject<EntityFile | null>();
		getObjectById$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('entityFileId', 'file-1');
		fixture.componentRef.setInput('alternative', 'original');
		fixture.detectChanges();

		expect(getObjectById$$$).toHaveBeenCalledWith('file-1', true, true);

		source.next(file);
		fixture.detectChanges();

		expect(fixture.componentInstance.fileDuration()).toBe(42);
	});

	it('falls back to the config-provided client duration when extra has none', () => {
		const source = new Subject<EntityFile | null>();
		getObjectById$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('entityFileId', 'file-1');
		fixture.detectChanges();

		source.next({ ...file, extra: {}, config: { clientDuration: 17 } });
		fixture.detectChanges();

		expect(fixture.componentInstance.fileDuration()).toBe(17);
	});

	it('falls back to zero when neither the extra nor the config carries a duration', () => {
		const source = new Subject<EntityFile | null>();
		getObjectById$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('entityFileId', 'file-1');
		fixture.detectChanges();

		source.next({ ...file, extra: {}, config: {} });
		fixture.detectChanges();

		expect(fixture.componentInstance.fileDuration()).toBe(0);
	});

	it('ignores a null emission', () => {
		const source = new Subject<EntityFile | null>();
		getObjectById$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('entityFileId', 'file-1');
		fixture.detectChanges();

		expect(() => source.next(null)).not.toThrow();
		expect(fixture.componentInstance.fileDuration()).toBe(0);
	});
});
