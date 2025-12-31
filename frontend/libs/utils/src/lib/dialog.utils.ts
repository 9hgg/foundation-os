import { DialogRef } from '@angular/cdk/dialog';
import { filter, merge, tap } from 'rxjs';

export function dialogCloser$<R, C>(dialogRef: DialogRef<R, C>) {
	dialogRef.disableClose = true;
	return merge(
		//
		dialogRef.keydownEvents.pipe(filter((e) => e.key === 'Escape')),
		dialogRef.backdropClick
	);
}
