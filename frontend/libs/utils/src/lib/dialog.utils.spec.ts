import { Subject } from 'rxjs';
import { dialogCloser$ } from './dialog.utils';

function makeDialogRef() {
  const keydownEvents = new Subject<KeyboardEvent>();
  const backdropClick = new Subject<MouseEvent>();
  return {
    disableClose: false,
    keydownEvents: keydownEvents.asObservable(),
    backdropClick: backdropClick.asObservable(),
    _keydown: keydownEvents,
    _backdrop: backdropClick,
  } as any;
}

describe('dialogCloser$', () => {
  it('sets disableClose to true on the dialogRef', () => {
    const ref = makeDialogRef();
    dialogCloser$(ref);
    expect(ref.disableClose).toBe(true);
  });

  it('emits when Escape key is pressed', () => {
    const ref = makeDialogRef();
    const emitted: any[] = [];
    dialogCloser$(ref).subscribe((e) => emitted.push(e));

    ref._keydown.next(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(emitted).toHaveLength(1);
  });

  it('does not emit for non-Escape keys', () => {
    const ref = makeDialogRef();
    const emitted: any[] = [];
    dialogCloser$(ref).subscribe((e) => emitted.push(e));

    ref._keydown.next(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(emitted).toHaveLength(0);
  });

  it('emits when backdrop is clicked', () => {
    const ref = makeDialogRef();
    const emitted: any[] = [];
    dialogCloser$(ref).subscribe((e) => emitted.push(e));

    ref._backdrop.next(new MouseEvent('click'));
    expect(emitted).toHaveLength(1);
  });
});
