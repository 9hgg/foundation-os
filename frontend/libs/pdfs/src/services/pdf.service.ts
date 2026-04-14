import { HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RequestService } from '@foundation/network/services';
import { Observable, from, map, of, shareReplay, switchMap, throwError, finalize } from 'rxjs';

import { PdfErrorResponse, PdfRenderError, PdfRenderRequest } from '../models/pdf.models';

@Injectable({ providedIn: 'root' })
export class PdfService {
	private readonly _requestService = inject(RequestService);
	private readonly _inFlightRequests = new Map<string, Observable<Blob>>();

	/**
	 * Render a PDF and return it as a Blob.
	 * Uses RequestService with responseType 'blob' to support binary responses.
	 */
	renderPdfBlob$<TPayload extends Record<string, unknown>>(
		request: PdfRenderRequest<TPayload>
	): Observable<Blob> {
		const cacheKey = this._buildCacheKey(request);
		const cached = this._inFlightRequests.get(cacheKey);
		if (cached) {
			return cached;
		}

		const body: Record<string, unknown> = {
			documentType: request.documentType,
			payload: request.payload,
			options: request.options,
			template: request.template,
		};

		const request$ = this._requestService
			.postBlob$('/api/pdfs/render', body, { silentError: true })
			.pipe(
				switchMap((response) => this._handleBlobResponse(response)),
				finalize(() => this._inFlightRequests.delete(cacheKey)),
				shareReplay({ bufferSize: 1, refCount: false })
			);

		this._inFlightRequests.set(cacheKey, request$);
		return request$;
	}

	/**
	 * Render a PDF and return a blob URL that can be used in an iframe.
	 */
	renderPdfUrl$<TPayload extends Record<string, unknown>>(
		request: PdfRenderRequest<TPayload>
	): Observable<string> {
		return this.renderPdfBlob$(request).pipe(map((blob) => URL.createObjectURL(blob)));
	}

	/**
	 * Render to HTML and return it as a Blob.
	 */
	renderHtmlBlob$<TPayload extends Record<string, unknown>>(
		request: PdfRenderRequest<TPayload>
	): Observable<Blob> {
		const body: Record<string, unknown> = {
			documentType: request.documentType,
			payload: request.payload,
			options: request.options,
			template: request.template,
		};

		return this._requestService
			.postBlob$('/api/pdfs/render-html', body, { silentError: true })
			.pipe(switchMap((response) => this._handleHtmlBlobResponse(response)));
	}

	/**
	 * Revoke a previously created object URL to avoid memory leaks.
	 */
	revokeObjectUrl(url: string): void {
		if (!url) {
			return;
		}
		URL.revokeObjectURL(url);
	}

	private _handleBlobResponse(response: HttpResponse<Blob>): Observable<Blob> {
		const contentType = response.headers.get('content-type') ?? '';
		const body = response.body;
		if (!body) {
			return throwError((): PdfRenderError => ({
				title: 'Empty response',
				description: 'The server returned an empty response.',
				code: 'empty_response',
			}));
		}

		if (contentType.includes('application/pdf')) {
			return of(body);
		}

		return from(body.text()).pipe(
			switchMap((text) => this._handleErrorPayload(text))
		);
	}

	private _handleHtmlBlobResponse(response: HttpResponse<Blob>): Observable<Blob> {
		const contentType = response.headers.get('content-type') ?? '';
		const body = response.body;
		if (!body) {
			return throwError((): PdfRenderError => ({
				title: 'Empty response',
				description: 'The server returned an empty response.',
				code: 'empty_response',
			}));
		}

		if (contentType.includes('text/html')) {
			return of(body);
		}

		return from(body.text()).pipe(
			switchMap((text) => this._handleErrorPayload(text))
		);
	}

	private _handleErrorPayload(text: string): Observable<Blob> {
		const parsed = this._safeJsonParse(text);
		if (parsed && this._isErrorResponse(parsed) && parsed.error) {
			return throwError(() => parsed.error);
		}
		return throwError((): PdfRenderError => ({
			title: 'Invalid response',
			description: 'The server returned an unexpected response.',
			code: 'invalid_response',
		}));
	}

	private _safeJsonParse(text: string): unknown {
		try {
			const parsed: unknown = JSON.parse(text);
			return parsed;
		} catch {
			return null;
		}
	}

	private _isErrorResponse(value: unknown): value is PdfErrorResponse {
		if (!this._isRecord(value)) {
			return false;
		}
		return 'error' in value;
	}

	private _isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	private _buildCacheKey<TPayload extends Record<string, unknown>>(
		request: PdfRenderRequest<TPayload>
	): string {
		const normalized = this._normalizeValue({
			documentType: request.documentType,
			payload: request.payload,
			options: request.options ?? null,
			template: request.template ?? null,
		});
		return JSON.stringify(normalized);
	}

	renderSimpleReportUrl$<TPayload extends Record<string, unknown>>(
		payload: TPayload,
		options?: PdfRenderRequest<TPayload>['options'],
		template?: string
	): Observable<string> {
		return this.renderPdfUrl$({
			documentType: 'report',
			payload,
			options,
			template,
		});
	}

	private _normalizeValue(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => this._normalizeValue(item));
		}
		if (!this._isRecord(value)) {
			return value;
		}
		const sortedKeys = Object.keys(value).sort();
		const normalized: Record<string, unknown> = {};
		for (const key of sortedKeys) {
			normalized[key] = this._normalizeValue(value[key]);
		}
		return normalized;
	}
}
