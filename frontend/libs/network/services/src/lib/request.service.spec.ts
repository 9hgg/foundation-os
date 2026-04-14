import { TestBed } from '@angular/core/testing';
import { RequestService, DEFAULT_BACKEND_URL } from './request.service';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';

describe('RequestService', () => {
  let service: RequestService;
  let httpClientMock: any;

  beforeEach(() => {
    httpClientMock = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        RequestService,
        { provide: HttpClient, useValue: httpClientMock },
      ],
    });
    service = TestBed.inject(RequestService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('clearCache', () => {
    it('should emit on clearCache$', () => {
      const spy = vi.fn();
      service.clearCache$.subscribe(spy);
      service.clearCache();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('get$', () => {
    it('should make a raw GET request', () => {
      const mockData = { foo: 'bar' };
      httpClientMock.get.mockReturnValue(of(mockData));

      service.get$('/test').subscribe((res) => {
        expect(res).toEqual(mockData);
      });
      expect(httpClientMock.get).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/test',
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('should pass query params', () => {
      httpClientMock.get.mockReturnValue(of({}));

      service.get$('/test', { page: '1' }).subscribe();
      expect(httpClientMock.get).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/test',
        expect.objectContaining({ withCredentials: true })
      );
    });
  });

  describe('getBasic$', () => {
    it('should make a GET request', () => {
      const mockResponse = { result: { data: 'test' } };
      httpClientMock.get.mockReturnValue(of(mockResponse));

      service.getBasic$('/test').subscribe((res) => {
        expect(res).toEqual(mockResponse);
        expect(httpClientMock.get).toHaveBeenCalledWith(
          DEFAULT_BACKEND_URL + '/test',
          expect.objectContaining({ withCredentials: true })
        );
      });
    });

    it('should handle error responses', () => {
      const mockError = { error: { title: 'Error' } };
      httpClientMock.get.mockReturnValue(of(mockError));

      service.getBasic$('/test').subscribe((res) => {
        expect(res).toEqual(mockError);
      });
    });

    it('should handle http errors and return error response', () => {
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Http Error')));

      service.getBasic$('/test').subscribe((res) => {
        expect(res.error).toBeDefined();
        expect(res.error?.title).toBe('Error');
      });
    });

    it('should suppress error alert with silentError option', () => {
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Http Error')));

      service.getBasic$('/test', undefined, { silentError: true }).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('getObject$', () => {
    it('should make a GET request for a single object', () => {
      const mockResponse = { result: { data: { id: '1' }, self: '/test/1', all: '/test' } };
      httpClientMock.get.mockReturnValue(of(mockResponse));

      service.getObject$('/test/1').subscribe((res) => {
        expect(res.result?.data).toEqual({ id: '1' });
      });
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Not Found' } };
      httpClientMock.get.mockReturnValue(of(mockError));

      service.getObject$('/test/1').subscribe((res) => {
        expect(res.error?.title).toBe('Not Found');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Network Error')));

      service.getObject$('/test/1').subscribe((res) => {
        expect(res.error).toBeDefined();
        expect(res.error?.code).toBe('unknown');
      });
    });
  });

  describe('getObjectList$', () => {
    it('should make a GET request for a paginated list', () => {
      const mockResponse = {
        result: {
          data: [{ id: '1' }],
          self: '/test',
          all: '/test',
          next: '',
          hasNext: false,
          prev: '',
          hasPrev: false,
          totalCount: 1,
          page: 1,
        },
      };
      httpClientMock.get.mockReturnValue(of(mockResponse));

      service.getObjectList$('/test').subscribe((res) => {
        expect(res.result?.data).toEqual([{ id: '1' }]);
        expect(res.result?.totalCount).toBe(1);
      });
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Error' } };
      httpClientMock.get.mockReturnValue(of(mockError));

      service.getObjectList$('/test').subscribe((res) => {
        expect(res.error?.title).toBe('Error');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Network Error')));

      service.getObjectList$('/test').subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('post$', () => {
    it('should make a POST request', () => {
      const mockResponse = { result: { data: 'test' } };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      service.post$('/test', { data: 'test' }).subscribe((res) => {
        expect(res).toEqual(mockResponse);
        expect(httpClientMock.post).toHaveBeenCalledWith(
          DEFAULT_BACKEND_URL + '/test',
          { data: 'test' },
          expect.objectContaining({ withCredentials: true })
        );
      });
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Bad Request' } };
      httpClientMock.post.mockReturnValue(of(mockError));

      service.post$('/test', {}).subscribe((res) => {
        expect(res.error?.title).toBe('Bad Request');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.post.mockReturnValue(throwError(() => new Error('Network Error')));

      service.post$('/test', {}).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('postBlob$', () => {
    it('should make a POST request expecting a blob response', () => {
      const mockResponse = { body: new Blob(['pdf']), headers: {} };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      service.postBlob$('/test', { data: 'test' }).subscribe((res) => {
        expect(res).toBeDefined();
      });
      expect(httpClientMock.post).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/test',
        { data: 'test' },
        expect.objectContaining({ responseType: 'blob', observe: 'response', withCredentials: true })
      );
    });
  });

  describe('postFormDataWithProgress$', () => {
    it('should make a POST request with FormData', () => {
      httpClientMock.post.mockReturnValue(of({ type: 0 }));

      service.postFormDataWithProgress$('/upload', { file: 'content' }).subscribe((res) => {
        expect(res).toBeDefined();
      });
      expect(httpClientMock.post).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/upload',
        expect.any(FormData),
        expect.objectContaining({ reportProgress: true, observe: 'events', withCredentials: true })
      );
    });
  });

  describe('put$', () => {
    it('should make a PUT request', () => {
      const mockResponse = { result: { updated: true } };
      httpClientMock.put.mockReturnValue(of(mockResponse));

      service.put$('/test/1', { name: 'updated' }).subscribe((res) => {
        expect(res.result).toEqual({ updated: true });
      });
      expect(httpClientMock.put).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/test/1',
        { name: 'updated' },
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Forbidden' } };
      httpClientMock.put.mockReturnValue(of(mockError));

      service.put$('/test/1', {}).subscribe((res) => {
        expect(res.error?.title).toBe('Forbidden');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.put.mockReturnValue(throwError(() => new Error('Network Error')));

      service.put$('/test/1', {}).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('putObject$', () => {
    it('should make a PUT request for an object', () => {
      const mockResponse = { result: { data: { id: '1' }, self: '/test/1', all: '/test' } };
      httpClientMock.put.mockReturnValue(of(mockResponse));

      service.putObject$('/test/1', { id: '1' }).subscribe((res) => {
        expect(res.result?.data).toEqual({ id: '1' });
      });
    });

    it('should handle http errors', () => {
      httpClientMock.put.mockReturnValue(throwError(() => new Error('Network Error')));

      service.putObject$('/test/1', {}).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('postObject$', () => {
    it('should make a POST request for an object', () => {
      const mockResponse = { result: { data: { id: '1' }, self: '/test/1', all: '/test' } };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      service.postObject$('/test', { name: 'new' }).subscribe((res) => {
        expect(res.result?.data).toEqual({ id: '1' });
      });
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Conflict' } };
      httpClientMock.post.mockReturnValue(of(mockError));

      service.postObject$('/test', {}).subscribe((res) => {
        expect(res.error?.title).toBe('Conflict');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.post.mockReturnValue(throwError(() => new Error('Network Error')));

      service.postObject$('/test', {}).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('patchObject$', () => {
    it('should make a PATCH request', () => {
      const mockResponse = { result: { data: { id: '1', name: 'patched' }, self: '/test/1', all: '/test' } };
      httpClientMock.patch.mockReturnValue(of(mockResponse));

      service.patchObject$('/test/1', { name: 'patched' }).subscribe((res) => {
        expect(res.result?.data.name).toBe('patched');
      });
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Validation Error' } };
      httpClientMock.patch.mockReturnValue(of(mockError));

      service.patchObject$('/test/1', {}).subscribe((res) => {
        expect(res.error?.title).toBe('Validation Error');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.patch.mockReturnValue(throwError(() => new Error('Network Error')));

      service.patchObject$('/test/1', {}).subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });

  describe('deleteObject$', () => {
    it('should make a DELETE request', () => {
      const mockResponse = { result: { data: { id: '1' }, self: '/test/1', all: '/test' } };
      httpClientMock.delete.mockReturnValue(of(mockResponse));

      service.deleteObject$('/test/1').subscribe((res) => {
        expect(res.result?.data).toEqual({ id: '1' });
      });
      expect(httpClientMock.delete).toHaveBeenCalledWith(
        DEFAULT_BACKEND_URL + '/test/1',
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('should handle error response', () => {
      const mockError = { error: { title: 'Not Found' } };
      httpClientMock.delete.mockReturnValue(of(mockError));

      service.deleteObject$('/test/1').subscribe((res) => {
        expect(res.error?.title).toBe('Not Found');
      });
    });

    it('should handle http errors', () => {
      httpClientMock.delete.mockReturnValue(throwError(() => new Error('Network Error')));

      service.deleteObject$('/test/1').subscribe((res) => {
        expect(res.error).toBeDefined();
      });
    });
  });
});
