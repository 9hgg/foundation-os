import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { RequestService } from '@foundation/network/services';
import { PdfService } from './pdf.service';

function makeRequestMock() {
  return { postBlob$: vi.fn() };
}

function makeOkBlobResponse(blob: Blob, contentType: string) {
  return new HttpResponse<Blob>({
    body: blob,
    headers: new HttpHeaders({ 'content-type': contentType }),
    status: 200,
  });
}

// jsdom's Blob does not implement text(), which the service's error path relies on to read
// the body back out; stand in with a Blob-shaped object that does.
function makeTextBlob(text: string): Blob {
  return { text: () => Promise.resolve(text) } as unknown as Blob;
}

describe('PdfService', () => {
  let service: PdfService;
  let requestMock: ReturnType<typeof makeRequestMock>;

  beforeEach(() => {
    requestMock = makeRequestMock();
    TestBed.configureTestingModule({
      providers: [PdfService, { provide: RequestService, useValue: requestMock }],
    });
    service = TestBed.inject(PdfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('revokeObjectUrl', () => {
    it('does not throw for empty string', () => {
      expect(() => service.revokeObjectUrl('')).not.toThrow();
    });

    it('calls URL.revokeObjectURL for valid url', () => {
      const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      service.revokeObjectUrl('blob:http://localhost/123');
      expect(spy).toHaveBeenCalledWith('blob:http://localhost/123');
      spy.mockRestore();
    });
  });

  describe('_safeJsonParse', () => {
    const parse = (text: string) => (service as any)._safeJsonParse(text);

    it('parses valid JSON object', () => {
      expect(parse('{"key":"value"}')).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', () => {
      expect(parse('not json')).toBeNull();
    });

    it('parses arrays', () => {
      expect(parse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('parses null literal', () => {
      expect(parse('null')).toBeNull();
    });
  });

  describe('_isRecord', () => {
    const isRecord = (val: unknown) => (service as any)._isRecord(val);

    it('returns true for plain objects', () => {
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('returns false for strings', () => {
      expect(isRecord('string')).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(isRecord(42)).toBe(false);
    });
  });

  describe('_isErrorResponse', () => {
    const isErr = (val: unknown) => (service as any)._isErrorResponse(val);

    it('returns true for object with error key', () => {
      expect(isErr({ error: { title: 'oops' } })).toBe(true);
    });

    it('returns false for object without error key', () => {
      expect(isErr({ result: 'ok' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isErr(null)).toBe(false);
    });
  });

  describe('_normalizeValue', () => {
    const normalize = (val: unknown) => (service as any)._normalizeValue(val);

    it('returns primitives unchanged', () => {
      expect(normalize(42)).toBe(42);
      expect(normalize('hello')).toBe('hello');
    });

    it('sorts object keys alphabetically', () => {
      const result = normalize({ z: 1, a: 2, m: 3 }) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(['a', 'm', 'z']);
    });

    it('normalizes nested objects recursively', () => {
      const result = normalize({ b: { y: 1, x: 2 } }) as Record<string, unknown>;
      expect(Object.keys(result['b'] as object)).toEqual(['x', 'y']);
    });

    it('normalizes arrays element-wise', () => {
      const result = normalize([{ b: 1, a: 2 }]) as Record<string, unknown>[];
      expect(Object.keys(result[0]!)).toEqual(['a', 'b']);
    });
  });

  describe('_buildCacheKey', () => {
    const buildKey = (req: any) => (service as any)._buildCacheKey(req);

    it('produces same key for identical request', () => {
      const req = { documentType: 'report', payload: { x: 1 } };
      expect(buildKey(req)).toBe(buildKey(req));
    });

    it('produces same key regardless of payload key order', () => {
      const key1 = buildKey({ documentType: 'r', payload: { a: 1, b: 2 } });
      const key2 = buildKey({ documentType: 'r', payload: { b: 2, a: 1 } });
      expect(key1).toBe(key2);
    });

    it('produces different keys for different payloads', () => {
      const key1 = buildKey({ documentType: 'r', payload: { x: 1 } });
      const key2 = buildKey({ documentType: 'r', payload: { x: 2 } });
      expect(key1).not.toBe(key2);
    });
  });

  describe('renderPdfBlob$', () => {
    it('returns same observable for same request (in-flight cache)', () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));

      const req = { documentType: 'report', payload: { id: 'cache-test' } };
      const obs1 = service.renderPdfBlob$(req);
      const obs2 = service.renderPdfBlob$(req);
      expect(obs1).toBe(obs2);
    });

    it('emits a Blob on success with application/pdf content-type', async () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));

      const { firstValueFrom } = await import('rxjs');
      const result = await firstValueFrom(service.renderPdfBlob$({ documentType: 'test', payload: { uid: 'b2' } }));
      expect(result).toBeInstanceOf(Blob);
    });

    it('sends the documentType, payload, options and template as the request body', () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));

      service.renderPdfBlob$({ documentType: 'invoice', payload: { id: 1 }, options: { pageSize: 'A4' }, template: 'custom' }).subscribe();

      expect(requestMock.postBlob$).toHaveBeenCalledWith(
        '/api/pdfs/render',
        { documentType: 'invoice', payload: { id: 1 }, options: { pageSize: 'A4' }, template: 'custom' },
        { silentError: true }
      );
    });

    it('rejects with "Empty response" when the server returns no body', async () => {
      requestMock.postBlob$.mockReturnValue(
        of(new HttpResponse<Blob>({ body: null, headers: new HttpHeaders({ 'content-type': 'application/pdf' }), status: 200 }))
      );

      await expect(new Promise((_resolve, reject) => service.renderPdfBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toMatchObject({
        title: 'Empty response',
        code: 'empty_response',
      });
    });

    it('reports the server-provided error when the content-type is not a pdf', async () => {
      const errorBody = makeTextBlob(JSON.stringify({ error: { title: 'Rendering failed', description: 'template not found' } }));
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(errorBody, 'application/json')));

      await expect(new Promise((_resolve, reject) => service.renderPdfBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toEqual({
        title: 'Rendering failed',
        description: 'template not found',
      });
    });

    it('falls back to "Invalid response" when the error payload is not valid JSON', async () => {
      const errorBody = makeTextBlob('not json');
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(errorBody, 'text/plain')));

      await expect(new Promise((_resolve, reject) => service.renderPdfBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toMatchObject({
        title: 'Invalid response',
        code: 'invalid_response',
      });
    });

    it('falls back to "Invalid response" when the JSON payload has no error key', async () => {
      const errorBody = makeTextBlob(JSON.stringify({ message: 'nope' }));
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(errorBody, 'application/json')));

      await expect(new Promise((_resolve, reject) => service.renderPdfBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toMatchObject({
        title: 'Invalid response',
      });
    });

    it('drops the in-flight cache entry once the request completes, so a later call re-requests', async () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));

      const req = { documentType: 'report', payload: { id: 'refetch' } };
      const { firstValueFrom } = await import('rxjs');
      await firstValueFrom(service.renderPdfBlob$(req));
      expect(requestMock.postBlob$).toHaveBeenCalledTimes(1);

      await firstValueFrom(service.renderPdfBlob$(req));
      expect(requestMock.postBlob$).toHaveBeenCalledTimes(2);
    });
  });

  describe('renderPdfUrl$', () => {
    it('turns the rendered blob into an object url', async () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/abc');

      const { firstValueFrom } = await import('rxjs');
      const url = await firstValueFrom(service.renderPdfUrl$({ documentType: 'report', payload: {} }));

      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(url).toBe('blob:http://localhost/abc');
      createObjectURL.mockRestore();
    });
  });

  describe('renderSimpleReportUrl$', () => {
    it('renders as a "report" document with the given payload, options and template', () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'application/pdf')));
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/report');

      service.renderSimpleReportUrl$({ title: 'Q1' }, { pageSize: 'A4' }, 'custom-template').subscribe();

      expect(requestMock.postBlob$).toHaveBeenCalledWith(
        '/api/pdfs/render',
        { documentType: 'report', payload: { title: 'Q1' }, options: { pageSize: 'A4' }, template: 'custom-template' },
        { silentError: true }
      );
    });
  });

  describe('renderHtmlBlob$', () => {
    it('emits the html Blob on success', async () => {
      const blob = new Blob(['<html></html>'], { type: 'text/html' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'text/html; charset=utf-8')));

      const { firstValueFrom } = await import('rxjs');
      const result = await firstValueFrom(service.renderHtmlBlob$({ documentType: 'report', payload: {} }));
      expect(result).toBe(blob);
    });

    it('sends the same request body shape as the pdf endpoint, against render-html', () => {
      const blob = new Blob(['<html></html>'], { type: 'text/html' });
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(blob, 'text/html')));

      service.renderHtmlBlob$({ documentType: 'invoice', payload: { id: 1 } }).subscribe();

      expect(requestMock.postBlob$).toHaveBeenCalledWith('/api/pdfs/render-html', { documentType: 'invoice', payload: { id: 1 }, options: undefined, template: undefined }, { silentError: true });
    });

    it('rejects with "Empty response" when the server returns no body', async () => {
      requestMock.postBlob$.mockReturnValue(
        of(new HttpResponse<Blob>({ body: null, headers: new HttpHeaders({ 'content-type': 'text/html' }), status: 200 }))
      );

      await expect(new Promise((_resolve, reject) => service.renderHtmlBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toMatchObject({
        title: 'Empty response',
        code: 'empty_response',
      });
    });

    it('reports the server-provided error when the content-type is not html', async () => {
      const errorBody = makeTextBlob(JSON.stringify({ error: { title: 'Rendering failed' } }));
      requestMock.postBlob$.mockReturnValue(of(makeOkBlobResponse(errorBody, 'application/json')));

      await expect(new Promise((_resolve, reject) => service.renderHtmlBlob$({ documentType: 'report', payload: {} }).subscribe({ error: reject }))).rejects.toEqual({ title: 'Rendering failed' });
    });
  });
});
