import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RecordModals } from './record.modals';
import { RecordingModalComponent } from './recording-modal/recording-modal.component';

describe('RecordModals', () => {
	const open = vi.fn(() => ({ closed: of({ files: [] }) }));
	let modals: RecordModals;

	beforeEach(() => {
		open.mockClear();
		TestBed.configureTestingModule({ providers: [RecordModals, { provide: Dialog, useValue: { open } }] });
		modals = TestBed.inject(RecordModals);
	});

	afterEach(() => TestBed.resetTestingModule());

	it('opens the recorder with the buttons the caller asked for', () => {
		const data = { displayAudioBtn: true, displayVideoBtn: false, maxFiles: 3 };

		modals.openRecordingDialog(data);

		expect(open).toHaveBeenCalledWith(RecordingModalComponent, expect.objectContaining({ data }));
	});

	// A recording in progress must not be lost to a stray backdrop click.
	it('will not close itself on a click outside', () => {
		modals.openRecordingDialog({});

		expect(open.mock.calls[0][1]).toMatchObject({ disableClose: true });
	});

	it('sizes the dialog to the viewport, capped, and scrolls inside it', () => {
		modals.openRecordingDialog({});

		expect(open.mock.calls[0][1]).toMatchObject({ width: '92vw', maxWidth: '768px', maxHeight: '95%', panelClass: 'overflow-auto' });
	});

	it('hands the dialog reference back so the caller can await the recordings', () => {
		const dialogRef = modals.openRecordingDialog({});

		let result: unknown;
		dialogRef.closed.subscribe((value) => (result = value));
		expect(result).toEqual({ files: [] });
	});
});
