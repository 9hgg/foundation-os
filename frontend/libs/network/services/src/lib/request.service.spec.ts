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

    it('should handle errors', () => {
      const mockError = { error: { title: 'Error' } };
      httpClientMock.get.mockReturnValue(of(mockError));

      service.getBasic$('/test').subscribe((res) => {
        expect(res).toEqual(mockError);
      });
    });

    it('should handle http errors', () => {
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Http Error')));

      service.getBasic$('/test').subscribe((res) => {
        expect(res.error).toBeDefined();
        expect(res.error?.title).toBe('Error');
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
  });
});
