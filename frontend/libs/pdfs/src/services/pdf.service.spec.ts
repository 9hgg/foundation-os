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
      const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
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
  });
});
