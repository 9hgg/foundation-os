import { HttpClient } from '@angular/common/http';
import { Pipe, PipeTransform } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
@Pipe({
	name: 'resolve',
	standalone: true,
})
export class ResolveFinalUrlPipe implements PipeTransform {
	constructor(private _http: HttpClient) {}

	transform(initialUrl: string): Observable<string | null> {
		if (!initialUrl) {
			return of(null); // Return null if no URL is provided
		}

		// Perform an HTTP HEAD request to resolve the final URL
		return this._http.head(initialUrl, { observe: 'response' }).pipe(
			map((response) => response.url || null), // Extract the final URL
			tap((finalUrl) => console.log('Resolved URL:', finalUrl)), // Log the resolved URL
			catchError((error) => {
				console.error('Error resolving URL:', error);
				return of(null); // Return null in case of an error
			})
		);
	}
}
