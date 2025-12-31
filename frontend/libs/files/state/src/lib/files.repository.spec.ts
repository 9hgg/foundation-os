import { TestBed } from '@angular/core/testing';
import { FilesRepository, convertToUrl } from './files.repository';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RendererFactory2 } from '@angular/core';
import { DEFAULT_BACKEND_URL } from '@foundation/network/services';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { NotificationService } from '@foundation/notification';
import { of, EMPTY, throwError, Subject } from 'rxjs';

const rendererMock = {
	createElement: vi.fn().mockReturnValue({}),
	setStyle: vi.fn(),
	appendChild: vi.fn(),
	setProperty: vi.fn(),
	removeChild: vi.fn(),
};

const rendererFactoryMock = {
	createRenderer: vi.fn().mockReturnValue(rendererMock),
};

describe('FilesRepository', () => {
	// ... convertToUrl tests ...
	describe('convertToUrl', () => {
		it('should return http url as is', () => {
			expect(convertToUrl('http://example.com/image.png')).toBe('http://example.com/image.png');
		});

		it('should convert sp:// url', () => {
			expect(convertToUrl('sp://123')).toBe(DEFAULT_BACKEND_URL + '/api/files/storage/read/123/default');
		});

		it('should convert sp:// url with alternative', () => {
			expect(convertToUrl('sp://123', 'thumbnail')).toBe(DEFAULT_BACKEND_URL + '/api/files/storage/read/123/thumbnail');
		});

		it('should convert uuid string', () => {
			const uuid = '123e4567-e89b-12d3-a456-426614174000';
			expect(convertToUrl(uuid)).toBe(DEFAULT_BACKEND_URL + '/api/files/storage/read/' + uuid + '/default');
		});

		it('should convert sp:// url with download', () => {
			const url = 'sp://bucket/file.txt';
			const result = convertToUrl(url, 'default', true);
			expect(result).toBe('http://localhost:8000/api/files/storage/read/bucket/file.txt/default?download=true');
		});

		it('should convert uuid string with download', () => {
			const uuid = '12345678-1234-1234-1234-123456789012';
			const result = convertToUrl(uuid, 'default', true);
			expect(result).toBe(`http://localhost:8000/api/files/storage/read/${uuid}/default?download=true`);
		});

		it('should convert file object with download', () => {
			const file = { id: '123' } as any;
			const result = convertToUrl(file, 'default', true);
			expect(result).toBe('http://localhost:8000/api/files/storage/read/123/default?download=true');
		});

		it('should return path as is', () => {
			const url = '/path/to/file';
			expect(convertToUrl(url)).toBe(url);
		});

		it('should convert file object', () => {
			const file = { id: '123' } as any;
			expect(convertToUrl(file)).toContain('/api/files/storage/read/123/default');
		});
	});

	describe('Service', () => {
		let service: FilesRepository;
		let notificationServiceMock: any;
		let translationServiceMock: any;

		beforeEach(() => {
			notificationServiceMock = {
				prompt: vi.fn(),
				confirm: vi.fn(),
			};

			translationServiceMock = {
				prep: vi.fn().mockReturnValue(() => 'translated'),
			};

			TestBed.configureTestingModule({
				imports: [HttpClientTestingModule],
				providers: [FilesRepository, { provide: RendererFactory2, useValue: rendererFactoryMock }, { provide: NotificationService, useValue: notificationServiceMock }, { provide: TranslationService, useValue: translationServiceMock }],
			});
			service = TestBed.inject(FilesRepository);
		});

		it('should be created', () => {
			expect(service).toBeTruthy();
		});

		describe('renameFile', () => {
			it('should rename file if confirmed', () => {
				const file = { id: '1', publicFilename: 'old.txt' } as any;
				const newName = 'new.txt';
				notificationServiceMock.prompt.mockReturnValue({
					closed: of({ value: newName }),
				});
				const putObjectSpy = vi.spyOn(service.store, 'putObject$').mockReturnValue(of({} as any));

				service.renameFile(file).subscribe();

				expect(notificationServiceMock.prompt).toHaveBeenCalled();
				expect(putObjectSpy).toHaveBeenCalledWith({ ...file, publicFilename: newName });
			});

			it('should not rename file if cancelled', () => {
				const file = { id: '1', publicFilename: 'old.txt' } as any;
				notificationServiceMock.prompt.mockReturnValue({
					closed: of(null),
				});
				const putObjectSpy = vi.spyOn(service.store, 'putObject$');

				service.renameFile(file).subscribe();

				expect(notificationServiceMock.prompt).toHaveBeenCalled();
				expect(putObjectSpy).not.toHaveBeenCalled();
			});

			it('should not rename file if new name is empty', () => {
				const file = { id: '1', publicFilename: 'old.txt' } as any;
				notificationServiceMock.prompt.mockReturnValue({
					closed: of({ value: '' }),
				});
				const putObjectSpy = vi.spyOn(service.store, 'putObject$');

				service.renameFile(file).subscribe();

				expect(putObjectSpy).not.toHaveBeenCalled();
			});

			it('should handle undefined publicFilename', () => {
				const file = { id: '1' } as any; // publicFilename undefined
				const newName = 'new.txt';
				notificationServiceMock.prompt.mockReturnValue({
					closed: of({ value: newName }),
				});
				const putObjectSpy = vi.spyOn(service.store, 'putObject$').mockReturnValue(of({} as any));

				service.renameFile(file).subscribe();

				expect(notificationServiceMock.prompt).toHaveBeenCalledWith(expect.anything(), undefined, expect.objectContaining({ defaultValue: '' }));
			});
		});

		describe('deleteFile', () => {
			it('should delete file if confirmed', () => {
				const file = { id: '1' } as any;
				notificationServiceMock.confirm.mockReturnValue({
					closed: of(true),
				});
				const deleteObjectSpy = vi.spyOn(service.store, 'deleteObject$').mockReturnValue(of({} as any));

				service.deleteFile(file).subscribe();

				expect(notificationServiceMock.confirm).toHaveBeenCalled();
				expect(deleteObjectSpy).toHaveBeenCalledWith(file.id);
			});

			it('should not delete file if cancelled', () => {
				const file = { id: '1' } as any;
				notificationServiceMock.confirm.mockReturnValue({
					closed: of(false),
				});
				const deleteObjectSpy = vi.spyOn(service.store, 'deleteObject$');

				service.deleteFile(file).subscribe();

				expect(notificationServiceMock.confirm).toHaveBeenCalled();
				expect(deleteObjectSpy).not.toHaveBeenCalled();
			});
		});

		describe('upload methods', () => {
			it('should get resumable upload url', () => {
				const fileName = 'test.png';
				const contentType = 'image/png';
				const fileSize = 1000;
				const mockResponse = { result: { data: { uploadUrl: 'url' } } };
				// Access the protected _requestService via any cast or spy on the method if possible.
				// Since we didn't mock RequestService in TestBed, it's the real one (or trying to be).
				// But we imported HttpClientTestingModule, so it has a mock HttpClient.
				// However, to make it easier, let's mock RequestService property on the service instance
				// or spy on it if it's accessible. It's protected in GenericRepository.
				// We can cast service to any to access it.
				const requestServiceMock = {
					post$: vi.fn().mockReturnValue(of(mockResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				service.getResumableUploadUrl$(fileName, contentType, fileSize).subscribe();

				expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/files/storage/get-upload-details', {
					fileName,
					contentType,
					fileSize,
					alternative: undefined,
					fileId: undefined,
					folderPath: undefined,
					folderForId: undefined,
					folderForKind: undefined,
				});
			});

			it('should update after upload', () => {
				const fileId = '1';
				const mockResponse = { result: { file: { id: '1' } } };
				const requestServiceMock = {
					post$: vi.fn().mockReturnValue(of(mockResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				service.updateAfterUpload$(fileId).subscribe();

				expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/files/storage/update-after-upload', {
					fileId,
					force: false,
					duration: undefined,
				});
			});
		});
		describe('handleFileList$', () => {
			it('should handle file upload flow', () => {
				const file = new File(['content'], 'test.png', { type: 'image/png' });
				const fileList = {
					0: file,
					length: 1,
					item: () => file,
				} as unknown as FileList;

				const uploadDetailsResponse = {
					result: { data: { id: '1', uploadUrl: 'http://upload.url' } },
				};
				const updateAfterUploadResponse = {
					result: { file: { id: '1' }, taskId: 'task1' },
				};
				const taskProgressResponse = {
					id: 'task1',
					progress: 100,
					pollingCount: 1,
					taskCount: 1,
					completed: true,
				};

				// Spy on internal methods
				vi.spyOn(service, 'getResumableUploadUrl$').mockReturnValue(of(uploadDetailsResponse as any));
				vi.spyOn(service, 'updateAfterUpload$').mockReturnValue(of(updateAfterUploadResponse as any));
				vi.spyOn(service, 'getTaskProgress$').mockReturnValue(of(taskProgressResponse as any));
				vi.spyOn(service.store, 'getObjectById$$$').mockReturnValue(of({ id: '1' } as any));

				// Mock HttpClient put for the actual upload
				const httpClientPutSpy = vi.spyOn(TestBed.inject(HttpClient), 'put').mockReturnValue(of({ type: 4 } as any)); // HttpEventType.Response = 4

				service.handleFileList$(fileList).subscribe();

				expect(service.getResumableUploadUrl$).toHaveBeenCalledWith('test.png', 'image/png', 7, undefined, undefined, undefined);
				expect(httpClientPutSpy).toHaveBeenCalled();
				expect(service.updateAfterUpload$).toHaveBeenCalledWith('1', undefined, undefined);
				expect(service.getTaskProgress$).toHaveBeenCalledWith('task1', false);
			});

			it('should handle missing file data in getResumableUploadUrl', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;

				const requestServiceMock = {
					post$: vi.fn().mockReturnValue(of({ result: { data: null } })), // No data
					getBasic$: vi.fn(),
				};
				(service as any)._requestService = requestServiceMock;
				(service as any)._httpClient = { put: vi.fn() };

				service.handleFileList$(fileList).subscribe();

				vi.runAllTimers();

				expect(requestServiceMock.post$).toHaveBeenCalled();
				expect((service as any)._httpClient.put).not.toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should handle missing uploadUrl in getResumableUploadUrl', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;

				const requestServiceMock = {
					post$: vi.fn().mockReturnValue(of({ result: { data: { id: '1' } } })), // No uploadUrl
					getBasic$: vi.fn(),
				};
				(service as any)._requestService = requestServiceMock;
				(service as any)._httpClient = { put: vi.fn() };

				service.handleFileList$(fileList).subscribe();

				vi.runAllTimers();

				expect(requestServiceMock.post$).toHaveBeenCalled();
				expect((service as any)._httpClient.put).not.toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should remove progress bar', () => {
				vi.useFakeTimers();
				service['backgroundDiv'] = document.createElement('div');
				service['progressDiv'] = document.createElement('div');
				service['textDiv'] = document.createElement('div');

				service.removeProgressBar();

				expect(rendererFactoryMock.createRenderer().setStyle).toHaveBeenCalled();

				vi.runAllTimers();

				expect(service['backgroundDiv']).toBeNull();
				expect(service['progressDiv']).toBeNull();
				expect(service['textDiv']).toBeNull();
				vi.useRealTimers();
			});

			it('should handle file upload flow with progress events', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;
				const uploadUrl = 'http://upload.url';
				const fileDb = { id: '1', uploadUrl };

				const requestServiceMock = {
					post$: vi
						.fn()
						.mockReturnValueOnce(of({ result: { data: fileDb } }))
						.mockReturnValueOnce(of({ result: { file: fileDb, taskId: 'task1' } })),
					getBasic$: vi.fn().mockReturnValue(of({ result: { id: 'task1', progress: 100, completed: true, taskCount: 1 } })),
				};
				(service as any)._requestService = requestServiceMock;

				// Mock HttpClient.put with Progress events
				const putSubject = new Subject<any>();
				const httpClientMock = {
					put: vi.fn().mockReturnValue(putSubject.asObservable()),
				};
				(service as any)._httpClient = httpClientMock;

				const storeMock = {
					getObjectById$$$: vi.fn().mockReturnValue(of({ id: '1' })),
				};
				(service as any).store = storeMock;

				// Initialize allProgress to verify update
				service.allProgress = [0];

				service.handleFileList$(fileList).subscribe();

				// Emit UploadProgress
				putSubject.next({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });

				// Emit UploadProgress with percentage > 1
				putSubject.next({ type: HttpEventType.UploadProgress, loaded: 150, total: 100 });
				expect(service.allProgress[0]).toBe(0);

				// Emit UploadProgress with undefined total
				putSubject.next({ type: HttpEventType.UploadProgress, loaded: 50 }); // total undefined -> 1
				// 50 / 1 = 50 > 1 -> 0
				expect(service.allProgress[0]).toBe(0);

				// Emit UploadProgress with undefined total and small loaded
				putSubject.next({ type: HttpEventType.UploadProgress, loaded: 0.5 }); // total undefined -> 1
				// 0.5 / 1 = 0.5 <= 1 -> 0.8 * 0.5 = 0.4
				expect(service.allProgress[0]).toBe(0.4);

				putSubject.next({ type: HttpEventType.Response });
				putSubject.complete();

				vi.runAllTimers();

				expect(httpClientMock.put).toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should handle missing taskId in updateAfterUpload', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;
				const fileDb = { id: '1', uploadUrl: 'http://upload.url' };

				const requestServiceMock = {
					post$: vi
						.fn()
						.mockReturnValueOnce(of({ result: { data: fileDb } }))
						.mockReturnValueOnce(of({ result: { file: fileDb } })), // No taskId
					getBasic$: vi.fn(),
				};
				(service as any)._requestService = requestServiceMock;
				(service as any)._httpClient = { put: vi.fn().mockReturnValue(of({ type: HttpEventType.Response })) };
				(service as any).store = { getObjectById$$$: vi.fn().mockReturnValue(of({ id: '1' })) };

				service.handleFileList$(fileList).subscribe();

				vi.runAllTimers();

				expect(requestServiceMock.getBasic$).not.toHaveBeenCalled(); // Should not poll if no taskId
				vi.useRealTimers();
			});

			it('should return empty if fileList is undefined', () => {
				service.handleFileList$(undefined as any).subscribe();
				expect(service.isUploading).toBe(false);
			});

			it('should return empty if no files', () => {
				const fileList = [] as any;
				const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

				service.handleFileList$(fileList).subscribe();

				expect(consoleSpy).toHaveBeenCalledWith('No files selected');
				consoleSpy.mockRestore();
			});
		});
		describe('getTaskProgress$', () => {
			it('should poll task progress until completed', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const progressResponse1 = { result: { id: taskId, progress: 50, completed: false } };
				const progressResponse2 = { result: { id: taskId, progress: 100, completed: true } };

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValueOnce(of(progressResponse1)).mockReturnValueOnce(of(progressResponse2)),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = vi.fn();
				service.getTaskProgress$(taskId).subscribe(observerSpy);

				expect(observerSpy).toHaveBeenCalledWith(expect.objectContaining({ progress: 50 }));

				vi.runAllTimers();

				expect(observerSpy).toHaveBeenCalledWith(expect.objectContaining({ progress: 100, completed: true }));
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(2);
				vi.useRealTimers();
			});

			it('should handle task failure', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const progressResponse = { result: { id: taskId, failed: true } };

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of(progressResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = vi.fn();
				service.getTaskProgress$(taskId).subscribe(observerSpy);

				expect(observerSpy).toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(1);
				vi.useRealTimers();
			});

			it('should follow artifact task id', () => {
				vi.useFakeTimers();
				const taskId1 = 'task1';
				const taskId2 = 'task2';
				const progressResponse1 = { result: { id: taskId1, completed: true, artifactTaskId: taskId2 } };
				const progressResponse2 = { result: { id: taskId2, progress: 100, completed: true } };

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValueOnce(of(progressResponse1)).mockReturnValueOnce(of(progressResponse2)),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = vi.fn();
				service.getTaskProgress$(taskId1).subscribe(observerSpy);

				vi.runAllTimers();

				expect(requestServiceMock.getBasic$).toHaveBeenCalledWith(`/api/tasks/processing/${taskId1}/progress`);
				expect(requestServiceMock.getBasic$).toHaveBeenCalledWith(`/api/tasks/processing/${taskId2}/progress`);
				expect(observerSpy).toHaveBeenCalledWith(expect.objectContaining({ id: taskId2, completed: true }));
				vi.useRealTimers();
			});

			it('should handle http error', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const error = new Error('Network error');

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(throwError(() => error)),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = {
					next: vi.fn(),
					error: vi.fn(),
					complete: vi.fn(),
				};
				service.getTaskProgress$(taskId).subscribe(observerSpy);

				expect(observerSpy.error).toHaveBeenCalledWith(error);
				vi.useRealTimers();
			});

			it('should adjust polling delay', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const progressResponse = { result: { id: taskId, progress: 50, completed: false } };

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of(progressResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				service.getTaskProgress$(taskId).subscribe();

				// Initial poll
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(1);

				// Advance time for first 10 polls (1s delay)
				for (let i = 0; i < 10; i++) {
					vi.advanceTimersByTime(1000);
				}
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(11);

				// 11th poll (should set delay to 5000)
				vi.advanceTimersByTime(1000); // Wait for the 1s delay of the 10th poll to trigger the 11th request
				// Wait, logic:
				// poll() -> success -> pollingCount++ -> if > 10 delay=5000 -> setTimeout(poll, delay)

				// We are at count 11. Next delay should be 5000.
				vi.advanceTimersByTime(5000);
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(12);

				// Advance to count 21
				for (let i = 0; i < 9; i++) {
					vi.advanceTimersByTime(5000);
				}
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(21);

				// 21st poll (should set delay to 30000)
				vi.advanceTimersByTime(30000);
				expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(22);

				vi.useRealTimers();
			});

			describe('getTaskProgress$ coverage', () => {
				it('should log debug messages for task chain', () => {
					vi.useFakeTimers();
					const taskId1 = 'task1';
					const taskId2 = 'task2';
					const requestServiceMock = {
						getBasic$: vi
							.fn()
							.mockReturnValueOnce(of({ result: { id: taskId1, progress: 100, completed: true, artifactTaskId: taskId2 } }))
							.mockReturnValueOnce(of({ result: { id: taskId2, progress: 100, completed: true } })),
					};
					(service as any)._requestService = requestServiceMock;
					const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

					service.getTaskProgress$(taskId1, true).subscribe();

					expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('new task to follow'));
					vi.runAllTimers();
					consoleSpy.mockRestore();
					vi.useRealTimers();
				});

				it('should log debug messages for null result', () => {
					vi.useFakeTimers();
					const requestServiceMock = {
						getBasic$: vi.fn().mockReturnValue(of({ result: null })),
					};
					(service as any)._requestService = requestServiceMock;
					const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

					service.getTaskProgress$('task1', true).subscribe();

					expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No result for taskId'));
					consoleSpy.mockRestore();
					vi.useRealTimers();
				});

				it('should log debug messages for max polls and intervals', () => {
					vi.useFakeTimers();
					const requestServiceMock = {
						getBasic$: vi.fn().mockReturnValue(of({ result: { id: 'task1', progress: 50 } })),
					};
					(service as any)._requestService = requestServiceMock;
					const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

					service.getTaskProgress$('task1', true).subscribe();

					// Advance to > 10 polls (5s interval)
					for (let i = 0; i < 15; i++) vi.advanceTimersByTime(5000);
					expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Polling interval set to 5s'));

					// Advance to > 20 polls (30s interval)
					for (let i = 0; i < 15; i++) vi.advanceTimersByTime(30000);
					expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Polling interval set to 30s'));

					// Advance to > 30 polls (max reached)
					vi.advanceTimersByTime(30000);
					expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max poll count reached'));

					consoleSpy.mockRestore();
					vi.useRealTimers();
				});

				it('should respect stopped flag', () => {
					vi.useFakeTimers();
					const requestServiceMock = {
						getBasic$: vi.fn().mockReturnValue(of({ result: { id: 'task1', progress: 50 } })),
					};
					(service as any)._requestService = requestServiceMock;

					const subscription = service.getTaskProgress$('task1').subscribe();

					// Initial poll
					expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(1);

					// Unsubscribe
					subscription.unsubscribe();

					// Advance time, should not poll again
					vi.advanceTimersByTime(1000);
					expect(requestServiceMock.getBasic$).toHaveBeenCalledTimes(1);

					vi.useRealTimers();
				});
			});

			it('should handle file upload flow', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;
				const uploadUrl = 'http://upload.url';
				const fileDb = { id: '1', uploadUrl };

				// Mock getResumableUploadUrl$
				const requestServiceMock = {
					post$: vi
						.fn()
						.mockReturnValueOnce(of({ result: { data: fileDb } })) // getResumableUploadUrl
						.mockReturnValueOnce(of({ result: { file: fileDb, taskId: 'task1' } })), // updateAfterUpload
					getBasic$: vi.fn().mockReturnValue(of({ result: { id: 'task1', progress: 100, completed: true, taskCount: 1 } })), // getTaskProgress
				};
				(service as any)._requestService = requestServiceMock;

				// Mock HttpClient.put with Subject
				const putSubject = new Subject<any>();
				const httpClientMock = {
					put: vi.fn().mockReturnValue(putSubject),
				};
				(service as any)._httpClient = httpClientMock;

				// Mock store
				const storeMock = {
					getObjectById$$$: vi.fn().mockReturnValue(of({ id: '1' })),
				};
				(service as any).store = storeMock;

				service.handleFileList$(fileList).subscribe();

				// Emit UploadProgress
				putSubject.next({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
				vi.advanceTimersByTime(100);

				// Emit Response
				putSubject.next({ type: HttpEventType.Response });
				putSubject.complete();

				vi.runAllTimers();

				expect(requestServiceMock.post$).toHaveBeenCalledTimes(2);
				expect(httpClientMock.put).toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should handle file upload flow with task count increase and other events', () => {
				vi.useFakeTimers();
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = { length: 1, item: () => file, 0: file } as any;
				const uploadUrl = 'http://upload.url';
				const fileDb = { id: '1', uploadUrl };
				const taskId1 = 'task_1';
				const taskId2 = 'task_2';

				// Mock getResumableUploadUrl$
				const requestServiceMock = {
					post$: vi
						.fn()
						.mockReturnValueOnce(of({ result: { data: fileDb } })) // getResumableUploadUrl
						.mockReturnValueOnce(of({ result: { file: fileDb, taskId: taskId1 } })), // updateAfterUpload
					getBasic$: vi
						.fn()
						.mockReturnValueOnce(of({ result: { id: taskId1, progress: 100, completed: true, artifactTaskId: taskId2 } })) // First task completes, points to task2
						.mockReturnValueOnce(of({ result: { id: taskId2, progress: 100, completed: true } })), // Task2 completes
				};
				(service as any)._requestService = requestServiceMock;

				// Mock HttpClient.put with Subject
				const putSubject = new Subject<any>();
				const httpClientMock = {
					put: vi.fn().mockReturnValue(putSubject),
				};
				(service as any)._httpClient = httpClientMock;

				// Mock store
				const storeMock = {
					getObjectById$$$: vi.fn().mockReturnValue(of({ id: '1' })),
				};
				(service as any).store = storeMock;

				service.handleFileList$(fileList).subscribe();

				// Emit other event
				putSubject.next({ type: HttpEventType.Sent });

				// Emit Response
				putSubject.next({ type: HttpEventType.Response });
				putSubject.complete();

				vi.runAllTimers();

				expect(requestServiceMock.post$).toHaveBeenCalledTimes(2);
				expect(httpClientMock.put).toHaveBeenCalled();
				expect(storeMock.getObjectById$$$).toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should error if duration provided with multiple files', () => {
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = {
					length: 2,
					item: () => file,
					0: file,
					1: file,
					[Symbol.iterator]: function* () {
						yield file;
						yield file;
					},
				} as any;
				const options = { duration: 100 };

				const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

				service.handleFileList$(fileList, options).subscribe();

				expect(consoleSpy).toHaveBeenCalledWith('You cannot provide a duration and upload multiple files at the same time');
				consoleSpy.mockRestore();
			});

			it('should error if fileId provided with multiple files', () => {
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				const fileList = {
					length: 2,
					item: () => file,
					0: file,
					1: file,
					[Symbol.iterator]: function* () {
						yield file;
						yield file;
					},
				} as any;
				const options = { fileId: '123' };

				const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

				service.handleFileList$(fileList, options).subscribe();

				expect(consoleSpy).toHaveBeenCalledWith('You cannot provide a fileId and upload multiple files at the same time');
				consoleSpy.mockRestore();
			});

			it('should stop polling after max attempts', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const progressResponse = { result: { id: taskId, progress: 50, completed: false } };

				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of(progressResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = {
					next: vi.fn(),
					complete: vi.fn(),
				};
				service.getTaskProgress$(taskId).subscribe(observerSpy);

				// Fast forward past max polls (30)
				for (let i = 0; i < 40; i++) {
					vi.runOnlyPendingTimers();
				}

				expect(observerSpy.complete).toHaveBeenCalled();
				vi.useRealTimers();
			});

			it('should complete if no result', () => {
				vi.useFakeTimers();
				const taskId = 'task1';
				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of({ result: null })),
				};
				(service as any)._requestService = requestServiceMock;

				const observerSpy = {
					next: vi.fn(),
					complete: vi.fn(),
				};
				service.getTaskProgress$(taskId).subscribe(observerSpy);

				expect(observerSpy.complete).toHaveBeenCalled();
				expect(observerSpy.next).not.toHaveBeenCalled();
				vi.useRealTimers();
			});
		});

		describe('DOM manipulation', () => {
			it('should display progress bar', () => {
				const elementRef = { nativeElement: document.createElement('div') } as any;
				service.allProgress = [0.5];

				service.displayProgressBar(elementRef);

				expect(rendererMock.createElement).toHaveBeenCalledWith('div');
				expect(rendererMock.setStyle).toHaveBeenCalled();
				expect(rendererMock.appendChild).toHaveBeenCalled();
			});

			it('should remove progress bar', () => {
				const elementRef = { nativeElement: document.createElement('div') } as any;
				service.allProgress = [0.5];
				service.displayProgressBar(elementRef);

				vi.useFakeTimers();
				service.removeProgressBar(elementRef);
				vi.runAllTimers();

				expect(rendererMock.removeChild).toHaveBeenCalled();
				vi.useRealTimers();
			});
		});

		describe('chunk upload', () => {
			it('should recover from chunk upload', () => {
				const fileId = '1';
				const alternative = 'default';
				const mockResponse = { result: { taskId: 'task1' } };
				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of(mockResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				service.recoverFromChunkUpload$(fileId, alternative).subscribe();

				expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/files/storage/recover-from-chunks/1/default');
			});

			it('should get chunk upload url', () => {
				const fileId = '1';
				const alternative = 'default';
				const startBytes = 0;
				const endBytes = 100;
				const mockResponse = { result: { uploadUrl: 'url' } };
				const requestServiceMock = {
					getBasic$: vi.fn().mockReturnValue(of(mockResponse)),
				};
				(service as any)._requestService = requestServiceMock;

				service.getChunkUploadUrl$(fileId, alternative, startBytes, endBytes).subscribe();

				expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/files/storage/get-chunk-upload-url/1/default/0/100');
			});
		});

		describe('fetch utilities', () => {
			it('should get final url', async () => {
				const initialUrl = 'http://initial.com';
				const finalUrl = 'http://final.com';
				global.fetch = vi.fn().mockResolvedValue({ url: finalUrl } as any);

				const result = await service.getFinalUrl(initialUrl);

				expect(result).toBe(finalUrl);
			});

			it('should return initial url on error', async () => {
				const initialUrl = 'http://initial.com';
				global.fetch = vi.fn().mockRejectedValue(new Error('error'));

				const result = await service.getFinalUrl(initialUrl);

				expect(result).toBe(initialUrl);
			});

			it('should fetch text content', async () => {
				const url = 'http://example.com';
				const text = 'content';
				global.fetch = vi.fn().mockResolvedValue({ text: () => Promise.resolve(text) } as any);

				const result = await service.fetchTextContent(url);

				expect(result).toBe(text);
				expect(service.textContentCache.get(url)).toBe(text);
			});

			it('should return cached text content', async () => {
				const url = 'http://example.com';
				const text = 'content';
				service.textContentCache.set(url, text);
				global.fetch = vi.fn();

				const result = await service.fetchTextContent(url);

				expect(result).toBe(text);
				expect(global.fetch).not.toHaveBeenCalled();
			});

			it('should handle fetch text content error', async () => {
				const url = 'http://example.com';
				global.fetch = vi.fn().mockRejectedValue(new Error('error'));

				const result = await service.fetchTextContent(url);

				expect(result).toBeUndefined();
			});

			it('should limit cache size', async () => {
				const url = 'http://example.com';
				const text = 'content';
				global.fetch = vi.fn().mockResolvedValue({ text: () => Promise.resolve(text) } as any);

				// Fill cache
				for (let i = 0; i < 21; i++) {
					service.textContentCache.set(`url${i}`, 'text');
				}

				await service.fetchTextContent(url);

				expect(service.textContentCache.size).toBe(21); // 20 + 1 new one, but one removed so 21? logic says > 20 remove first. so 21 -> remove 1 -> 20. + 1 new = 21?
				// Wait, logic is: set, then if size > 20 delete first.
				// So if size is 21, delete 1 -> 20.
				// Let's check logic:
				// this.textContentCache.set(url, text);
				// if (this.textContentCache.size > 20) { ... delete ... }
				// So max size is 20.

				// Let's re-read code:
				// this.textContentCache.set(url, text);
				// if (this.textContentCache.size > 20) {
				//   const keys = Array.from(this.textContentCache.keys());
				//   this.textContentCache.delete(keys[0]);
				// }
				// So if I add 21st item, size becomes 21, then delete 1, so size becomes 20.
				// So max size is 20.

				// In test:
				// Fill with 21 items manually? No, if I fill manually, logic isn't triggered.
				// I should fill manually 20 items.
				service.textContentCache.clear();
				for (let i = 0; i < 20; i++) {
					service.textContentCache.set(`url${i}`, 'text');
				}

				await service.fetchTextContent(url);

				expect(service.textContentCache.size).toBe(20);
			});
		});

		describe('unloadNotification', () => {
			it('should set return value if uploading single file', () => {
				service.isUploading = true;
				service.nbFilesToUpload = 1;
				const event = { returnValue: '' };

				service.unloadNotification(event);

				expect(event.returnValue).toBe('Still uploading 1 file. Are you sure you want to leave?');
			});

			it('should set return value if uploading multiple files', () => {
				service.isUploading = true;
				service.nbFilesToUpload = 2;
				const event = { returnValue: '' };

				service.unloadNotification(event);

				expect(event.returnValue).toBe('Still uploading 2 files. Are you sure you want to leave?');
			});

			it('should not set return value if not uploading', () => {
				service.isUploading = false;
				const event = { returnValue: '' };

				service.unloadNotification(event);

				expect(event.returnValue).toBe('');
			});
		});
	});
});
