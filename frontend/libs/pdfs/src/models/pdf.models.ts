export type PdfEngine = 'playwright';
export type PdfPageSize = 'A4' | 'LETTER';
export type PdfDisposition = 'inline' | 'attachment';

export type PdfDocumentType = string & {};

export interface PdfRenderOptions {
	pageSize?: PdfPageSize;
	landscape?: boolean;
	disposition?: PdfDisposition;
	filename?: string;
	engine?: PdfEngine;
	locale?: string;
	debug?: boolean;
	headerTemplate?: string;
	footerTemplate?: string;
	marginTop?: string;
	marginBottom?: string;
	marginLeft?: string;
	marginRight?: string;
}

export interface PdfRenderRequest<TPayload extends Record<string, unknown> = Record<string, unknown>> {
	documentType: PdfDocumentType;
	payload: TPayload;
	options?: PdfRenderOptions;
	template?: string;
}

export interface PdfRenderError {
	title: string;
	description?: string;
	code?: string;
}

export interface PdfErrorResponse {
	error?: PdfRenderError;
	result?: unknown;
	message?: string;
}
