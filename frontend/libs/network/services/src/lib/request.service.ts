import { HttpClient, HttpEvent, HttpHeaders, HttpParams, HttpParamsOptions, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, Subject } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export let DEFAULT_BACKEND_URL = window.origin;

/** Works with caddy (no 4200 => no 8000) */
// DEFAULT_BACKEND_URL = DEFAULT_BACKEND_URL.replace('4200', '8000');
if (DEFAULT_BACKEND_URL.includes('localhost:')) {
	DEFAULT_BACKEND_URL = 'http://localhost:8000';
}

export function setBackendPort(port: number) {
	if (DEFAULT_BACKEND_URL.includes('localhost:')) {
		DEFAULT_BACKEND_URL = `http://localhost:${port}`;
		defaultRequestOptions.apiRoot = DEFAULT_BACKEND_URL;
	}
}

const DEBUG = false;

if (DEBUG) console.log({ DEFAULT_BACKEND_URL });

const alert = console.error;

export interface SimpleResponse<T> {
	data: T;
	self: string;
	all: string;
}

const SimpleResponseKeys = ['data', 'self', 'all'];

export interface PaginatedResponse<T> {
	/** The items on the current page */
	data: T[];
	/** The url to the current page */
	self: string;
	/** The url to the first page */
	all: string;
	/** The url to the next page */
	next: string;
	/** Whether there is a next page */
	hasNext: boolean;
	/** The url to the previous page */
	prev: string;
	/** Whether there is a previous page */
	hasPrev: boolean;
	/** The total number of items */
	totalCount: number;
	/** current page */
	page: number;
}

export interface PaginatedResponseHoled<T> extends Omit<PaginatedResponse<T>, 'data'> {
	/** The items on the current page */
	data: (T | null)[];
}

export interface LightPaginatedResponse<T> {
	paginatedResponseDetails: Omit<PaginatedResponse<T>, 'data'>;
	dataIds: string[];
}

export const PaginatedResponseKeys = ['data', 'self', 'all', 'next', 'hasNext', 'prev', 'hasPrev', 'totalCount', 'page'];

export type StringRecord = Record<string, any>;

export interface RequestOptions {
	silentError?: boolean;
	extraHeaders?:
		| HttpHeaders
		| {
				[header: string]: string | string[];
		  }
		| undefined;
	apiRoot?: string;
}

export interface RequestError {
	title: string;
	description?: string;
	code?: string;
	details?: Record<string, any>;
}

export interface RequestResponseWithResult<T> {
	result: T;
	error?: never;
}
export interface RequestResponseWithError {
	result?: never;
	error: RequestError;
}

export type RequestResponse<T extends StringRecord> = RequestResponseWithResult<T> | RequestResponseWithError;

const defaultRequestOptions: RequestOptions & { apiRoot: string } = {
	silentError: false,
	apiRoot: DEFAULT_BACKEND_URL,
};

@Injectable({
	providedIn: 'root',
})
export class RequestService {
	private _httpClient = inject(HttpClient);

	clearCache$ = new Subject<void>();

	/**
	 * Clears the cache of listeners:
	 * - smartRESTStore
	 */
	clearCache() {
		this.clearCache$.next();
	}

	get$<T extends StringRecord>(
		//
		endpoint: string,
		params?: HttpParamsOptions['fromObject'],
		options: Partial<RequestOptions> = defaultRequestOptions
	) {
		const _options = { ...defaultRequestOptions, ...options };

		const queryParamStr = new HttpParams({ fromObject: params });
		return this._httpClient.get<T>(_options.apiRoot + endpoint, {
			//
			params: queryParamStr,
			withCredentials: true,
			headers: options.extraHeaders,
		});
	}

	/**
	 * Use `getBasic$<T>` to get a RequestResponse<T>`
	 * @param apiRoot Should start by /
	 * @param endpoint
	 * @param params
	 * @param options
	 * @returns
	 */
	getBasic$<T extends StringRecord>(
		//
		endpoint: string,
		params?: HttpParamsOptions['fromObject'],
		options: Partial<RequestOptions> = defaultRequestOptions
	) {
		const _options = { ...defaultRequestOptions, ...options };

		const queryParamStr = new HttpParams({ fromObject: params });
		return this._httpClient
			.get<RequestResponse<T>>(_options.apiRoot + endpoint, {
				//
				params: queryParamStr,
				withCredentials: true,
				headers: options.extraHeaders,
			})
			.pipe(
				tap(() => {
					if (DEBUG) console.log('%c[RestService](get) ' + endpoint, 'color:purple', params);
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(getBasic$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(getBasic$)' + endpoint + ': ', response.error);
					}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const errorResponse: RequestResponse<T> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					return of(errorResponse);
				})
			);
	}

	/** Use `getObject$<T>` to get a `RequestResponse<SimpleResponse<T>>`
	 *
	 * It's more appropriate to use `getBasic$<T>` instead
	 * if not accessing a REST API endpoint
	 */
	getObject$<T>(
		//
		endpoint: string,
		params?: HttpParamsOptions['fromObject'],
		options: Partial<RequestOptions> = defaultRequestOptions
	): Observable<RequestResponse<SimpleResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		const queryParamStr = new HttpParams({ fromObject: params });
		return this._httpClient
			.get<RequestResponse<SimpleResponse<T>>>(_options.apiRoot + endpoint, {
				//
				params: queryParamStr,
				withCredentials: true,
				headers: options.extraHeaders,
			})
			.pipe(
				tap(() => {
					if (DEBUG) console.log('%c[RestService](get) ' + endpoint, 'color:purple', params);
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(getObject$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(getObject$)' + endpoint + ': ', response.error);
					}
				}),
				tap((response) => {
					if (response.result)
						// loop over keyof SimpleResponse to check if all are present
						for (const key of SimpleResponseKeys) {
							if (!(key in response.result)) {
								if (DEBUG) console.log('Invalid response, missing key: ' + key);
								throw new Error('Invalid response');
							}
						}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const result: RequestResponse<SimpleResponse<T>> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					return of(result);
				})
			);
	}

	getObjectList$<T>(endpoint: string, params?: HttpParamsOptions['fromObject'], options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<PaginatedResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		const queryParamStr = new HttpParams({ fromObject: params });
		return this._httpClient.get<RequestResponse<PaginatedResponse<T>>>(_options.apiRoot + endpoint, { params: queryParamStr, withCredentials: true }).pipe(
			tap(() => {
				if (DEBUG) console.log('%c[RestService](get) ' + endpoint, 'color:purple', params);
			}),
			tap((response) => {
				// Ensure that the response has the required keys
				if (!('result' in response || 'error' in response)) {
					alert('Invalid response, missing either result or error key');
					if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
					throw new Error('Invalid response');
				}
			}),
			tap((response) => {
				if (response.error && !_options.silentError) {
					alert('(getObjectList$)' + endpoint + ': ' + response.error.title);
					if (DEBUG) console.error('(getObjectList$)' + endpoint + ': ', response.error);
				}
			}),
			tap((response) => {
				if (response.result)
					// loop over keyof PaginatedResponse to check if all are present
					for (const key of PaginatedResponseKeys) {
						if (!(key in response.result)) {
							if (DEBUG) console.log('Invalid response, missing key: ' + key);
							throw new Error('Invalid response');
						}
					}
			}),

			// if errors, throw them
			catchError((error) => {
				if (!_options.silentError) {
					alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
				}
				const result: RequestResponse<PaginatedResponse<T>> = {
					error: {
						title: 'Error',
						description: 'An error occured',
						code: 'unknown',
						details: { error },
					},
				};
				return of(result);
			})
		);
	}

	// postFormData$<T>(endpoint: string, data: { [name: string]: string | Blob }): Observable<T> {
	// 	// if (DEBUG) console.log('%c[RestService](postFormData) ' + endpoint, 'color:purple', data);
	// 	const formData = new FormData();
	// 	for (const name in data) {
	// 		formData.append(name, data[name]);
	// 	}
	// 	return this._httpClient.post<T>(_options.apiRoot + endpoint, formData);
	// }

	postFormDataWithProgress$<T>(
		endpoint: string,
		data: { [name: string]: string | Blob },
		// data: { [name: string]:, any },
		options: Partial<RequestOptions> = defaultRequestOptions
	): Observable<HttpEvent<T>> {
		if (DEBUG) console.log('%c[RestService](postFormDataWithProgress) CALLING ' + endpoint, 'color:purple', data);
		const _options = { ...defaultRequestOptions, ...options };

		const formData = new FormData();
		for (const name in data) {
			formData.append(name, data[name]);
		}
		return this._httpClient.post<T>(_options.apiRoot + endpoint, formData, {
			reportProgress: true,
			observe: 'events',
			headers: options.extraHeaders,
			withCredentials: true,
		});
	}

	post$<ResponseType extends StringRecord, RequestParam = Record<string, any>>(endpoint: string, data: RequestParam, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<ResponseType>> {
		const _options = { ...defaultRequestOptions, ...options };

		return this._httpClient
			.post<RequestResponse<ResponseType>>(_options.apiRoot + endpoint, data, {
				withCredentials: true,
			})
			.pipe(
				tap(() => {
					if (DEBUG) console.log('%c[RestService](post) ' + endpoint, 'color:purple', data);
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(post$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(post$)' + endpoint + ': ', response.error);
					}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const result: RequestResponse<ResponseType> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					return of(result);
				})
			);
	}

	/**
	 * Post JSON and receive a Blob response with headers.
	 * Used for binary responses like PDFs.
	 */
	postBlob$<RequestParam = unknown>(
		endpoint: string,
		data: RequestParam,
		options: Partial<RequestOptions> = defaultRequestOptions
	): Observable<HttpResponse<Blob>> {
		const _options = { ...defaultRequestOptions, ...options };

		return this._httpClient.post(_options.apiRoot + endpoint, data, {
			withCredentials: true,
			observe: 'response',
			responseType: 'blob',
			headers: options.extraHeaders,
		});
	}

	put$<ResponseType extends StringRecord, RequestParam = Record<string, any>>(endpoint: string, data: RequestParam, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<ResponseType>> {
		const _options = { ...defaultRequestOptions, ...options };

		return this._httpClient
			.put<RequestResponse<ResponseType>>(_options.apiRoot + endpoint, data, {
				withCredentials: true,
			})
			.pipe(
				tap(() => {
					if (DEBUG) console.log('%c[RestService](post) ' + endpoint, 'color:purple', data);
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(put$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(put$)' + endpoint + ': ', response.error);
					}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const result: RequestResponse<ResponseType> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					return of(result);
				})
			);
	}

	// postForBlob$( endpoint: string, data: unknown): Observable<Blob> {
	// 	// if (DEBUG) console.log('%c[RestService](postForBlob) ' + endpoint, 'color:purple', data);
	// 	return this._httpClient.post(_options.apiRoot + endpoint, data, {
	// 		headers: {
	// 			'ngsw-bypass': 'custom-header',
	// 		},
	// 		responseType: 'blob',
	// 	});
	// }

	// putBasic$<T>( endpoint: string, data: unknown): Observable<T> {
	// 	// if (DEBUG) console.log('%c[RestService](put) ' + endpoint, 'color:purple', data);
	// 	return this._httpClient.put<T>(_options.apiRoot + endpoint, data);
	// }

	putObject$<T>(endpoint: string, data: T, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<SimpleResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		// if (DEBUG) console.log('%c[RestService](put) ' + endpoint, 'color:purple', data);
		return this._httpClient
			.put<RequestResponse<SimpleResponse<T>>>(_options.apiRoot + endpoint, data, {
				withCredentials: true,
			})
			.pipe(
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(putObject$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(putObject$)' + endpoint + ': ', response.error);
					}
				}),
				tap((response) => {
					if (response.result)
						// loop over keyof SimpleResponse to check if all are present
						for (const key of SimpleResponseKeys) {
							if (!(key in response.result)) {
								if (DEBUG) console.log('Invalid response, missing key: ' + key);
								throw new Error('Invalid response');
							}
						}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const result: RequestResponse<SimpleResponse<T>> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					console.log('putObject$ error', result);

					return of(result);
				})
			);
	}

	postObject$<T>(endpoint: string, data: T, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<SimpleResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		// if (DEBUG) console.log('%c[RestService](post) ' + endpoint, 'color:purple', data);
		return this._httpClient
			.post<RequestResponse<SimpleResponse<T>>>(_options.apiRoot + endpoint, data, {
				withCredentials: true,
			})
			.pipe(
				tap((response) => {
					// Ensure that the response has the required keys
					if (!('result' in response || 'error' in response)) {
						alert('Invalid response, missing either result or error key');
						if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
						throw new Error('Invalid response');
					}
				}),
				tap((response) => {
					// Ensure that the response has the required keys
					if (response.error && !_options.silentError) {
						alert('(postObject$)' + endpoint + ': ' + response.error.title);
						if (DEBUG) console.error('(postObject$)' + endpoint + ': ', response.error);
					}
				}),
				tap((response) => {
					if (response.result)
						// loop over keyof SimpleResponse to check if all are present
						for (const key of SimpleResponseKeys) {
							if (!(key in response.result)) {
								if (DEBUG) console.log('Invalid response, missing key: ' + key);
								throw new Error('Invalid response');
							}
						}
				}),
				// if errors, throw them
				catchError((error) => {
					if (!_options.silentError) {
						alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
					}
					const result: RequestResponse<SimpleResponse<T>> = {
						error: {
							title: 'Error',
							description: 'An error occured',
							code: 'unknown',
							details: { error },
						},
					};
					return of(result);
				})
			);
	}

	patchObject$<T>(endpoint: string, data: Partial<T>, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<SimpleResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		// if (DEBUG) console.log('%c[RestService](patch) ' + endpoint, 'color:purple', data);
		return this._httpClient.patch<RequestResponse<SimpleResponse<T>>>(_options.apiRoot + endpoint, data, { withCredentials: true }).pipe(
			tap((response) => {
				// Ensure that the response has the required keys
				if (!('result' in response || 'error' in response)) {
					alert('Invalid response, missing either result or error key');
					if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
					throw new Error('Invalid response');
				}
			}),
			tap((response) => {
				// Ensure that the response has the required keys
				if (response.error && !_options.silentError) {
					alert('(patchObject$)' + endpoint + ': ' + response.error.title);
					if (DEBUG) console.error('(patchObject$)' + endpoint + ': ', response.error);
				}
			}),
			tap((response) => {
				if (response.result)
					// loop over keyof SimpleResponse to check if all are present
					for (const key of SimpleResponseKeys) {
						if (!(key in response.result)) {
							if (DEBUG) console.log('Invalid response, missing key: ' + key);
							throw new Error('Invalid response');
						}
					}
			}),
			// if errors, throw them
			catchError((error) => {
				if (!_options.silentError) {
					alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
				}
				const result: RequestResponse<SimpleResponse<T>> = {
					error: {
						title: 'Error',
						description: 'An error occured',
						code: 'unknown',
						details: { error },
					},
				};
				return of(result);
			})
		);
	}

	deleteObject$<T>(endpoint: string, options: Partial<RequestOptions> = defaultRequestOptions): Observable<RequestResponse<SimpleResponse<T>>> {
		const _options = { ...defaultRequestOptions, ...options };

		// if (DEBUG) console.log('%c[RestService](delete) ' + endpoint, 'color:purple');
		return this._httpClient.delete<RequestResponse<SimpleResponse<T>>>(_options.apiRoot + endpoint, { withCredentials: true }).pipe(
			tap((response) => {
				// Ensure that the response has the required keys
				if (!('result' in response || 'error' in response)) {
					alert('Invalid response, missing either result or error key');
					if (DEBUG) console.error('Invalid response, missing either result or error key', _options.apiRoot + endpoint, response);
					throw new Error('Invalid response');
				}
			}),
			tap((response) => {
				// Ensure that the response has the required keys
				if (response.error && !_options.silentError) {
					alert('(deleteObject$)' + endpoint + ': ' + response.error.title);
					if (DEBUG) console.error('(deleteObject$)' + endpoint + ': ', response.error);
				}
			}),
			tap((response) => {
				if (response.result)
					// loop over keyof SimpleResponse to check if all are present
					for (const key of SimpleResponseKeys) {
						if (!(key in response.result)) {
							if (DEBUG) console.log('Invalid response, missing key: ' + key);
							throw new Error('Invalid response');
						}
					}
			}),
			// if errors, throw them
			catchError((error) => {
				if (!_options.silentError) {
					alert('An error occured while fetching data from the server. Please check your internet connection and try again.');
				}
				const result: RequestResponse<SimpleResponse<T>> = {
					error: {
						title: 'Error',
						description: 'An error occured',
						code: 'unknown',
						details: { error },
					},
				};
				return of(result);
			})
		);
	}

	/**
	 * Asks the server to execute an action (path: /api/actions/{actionName}/execute)
	 * @param actionName
	 * @param actionData
	 */

	// executeAction$<ActionParam extends Record<string, any> | undefined, ActionResult extends Record<string, any>>(
	// 	actionName: string,
	// 	actionData: ActionParam,
	// 	expectedKeyInResult: (string | undefined)[] = [],
	// 	options: Partial<RequestOptions> = defaultRequestOptions
	// ) {
	// 	const _options = { ...defaultRequestOptions, ...options };

	// 	if (DEBUG) console.log('%c[RestService](executeAction) ' + actionName, 'color:purple', actionData);
	// 	return this.post$<ActionResult, ActionParam>(
	// 		DEFAULT_BACKEND_URL,
	// 		'/api/actions/' + actionName + '/execute',
	// 		actionData,
	// 		{
	// 			silentError: true,
	// 		}
	// 	).pipe(
	// 		tap((response) => {
	// 			// Ensure that the response has the required keys
	// 			if (!('result' in response || 'error' in response)) {
	// 				alert('Invalid response, missing either result or error key');
	// 				if (DEBUG) console.error('Invalid response, missing either result or error key', actionName, response);
	// 				throw new Error('Invalid response');
	// 			}
	// 		}),
	// 		tap((response) => {
	// 			// Ensure that the response has the required keys
	// 			if (response.error && !_options.silentError) {
	// 				alert('(executeAction$)' + actionName + ': ' + response.error.title);
	// 				if (DEBUG) console.error('(executeAction$)' + actionName + ': ', response.error);
	// 			}
	// 		}),
	// 		tap((response) => {
	// 			if (response.result)
	// 				// loop over keyof SimpleResponse to check if all are present
	// 				for (const key of expectedKeyInResult) {
	// 					if (key && !(key in response.result)) {
	// 						if (DEBUG) console.log('Invalid response, missing key: ' + key);
	// 						throw new Error('Invalid response');
	// 					}
	// 				}
	// 		}),
	// 		// if errors, throw them
	// 		catchError((error) => {
	// 			if (!_options.silentError) {
	// 				alert(
	// 					'An error occured while fetching data from the server. Please check your internet connection and try again.'
	// 				);
	// 			}
	// 			const result: RequestResponse<ActionResult> = {
	// 				error: {
	// 					title: 'Error',
	// 					description: 'An error occured',
	// 					code: 'unknown',
	// 					details: { error },
	// 				},
	// 			};
	// 			return of(result);
	// 		})
	// 	);
	// }
}
