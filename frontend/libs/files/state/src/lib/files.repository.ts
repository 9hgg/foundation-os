import { InterceptorSkipHeader } from '@foundation/auth/state';
import { EntityFile } from '@foundation/files/models';
import { DEFAULT_BACKEND_URL, RequestResponse, SimpleResponse } from '@foundation/network/services';
import { GenericRepository } from '@foundation/table/state';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { ElementRef, inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { combineLatest, EMPTY, filter, finalize, interval, NEVER, Observable, of, shareReplay, skipUntil, switchMap, take, tap } from 'rxjs';

export interface TaskProgressResponse {
	id: string;
	progress: number;
	pollingCount: number;
	taskCount: number;
	started?: boolean;
	completed?: boolean;
	ended?: boolean;
	failed?: boolean;
	artifactTaskId?: string;
}

export function convertToUrl(fileInput: string | EntityFile, alternative: string = 'default', download = false) {
	if (typeof fileInput === 'string') {
		// http url
		if (fileInput.startsWith('http')) {
			return fileInput;
		}

		// custom url
		if (fileInput.startsWith('sp://')) {
			return DEFAULT_BACKEND_URL + '/api/files/storage/read/' + fileInput.substring(5) + '/' + alternative + (download ? '?download=true' : '');
		}
		// it's an id (check if it's a file id uuid4)
		if (fileInput.length == 36) {
			return DEFAULT_BACKEND_URL + '/api/files/storage/read/' + fileInput + '/' + alternative + (download ? '?download=true' : '');
		}

		// it's a path
		return fileInput;
	}
	// console.log('convertToUrl', fileInput, alternative, download);

	return DEFAULT_BACKEND_URL + '/api/files/storage/read/' + fileInput.id + '/' + alternative + (download ? '?download=true' : '');
}

@Injectable({ providedIn: 'root' })
export class FilesRepository extends GenericRepository<EntityFile> {
	private _httpClient = inject(HttpClient);
	private _rendererFactory = inject(RendererFactory2);

	isUploading = false;
	nbFilesToUpload = 0;
	private backgroundDiv: HTMLDivElement | null = null;
	private progressDiv: HTMLDivElement | null = null;
	private textDiv: HTMLDivElement | null = null;
	allProgress: number[] = [];
	_renderer: Renderer2;

	constructor() {
		super('file');
		this._renderer = this._rendererFactory.createRenderer(null, null);
		window.addEventListener('beforeunload', this.unloadNotification.bind(this));
	}

	private _i18n_renameSentence = this._translationService.prep('Give a new name to this file:');
	private _i18n_renameButtonText = this._translationService.prep('Rename File');
	private _i18n_renamePlaceholder = this._translationService.prep('File name');
	public renameFile(file: EntityFile) {
		return this._notificationService
			.prompt(this._i18n_renameSentence(), undefined, {
				defaultValue: file.publicFilename ?? '',
				inputPlaceholder: this._i18n_renamePlaceholder(),
				confirmButtonText: this._i18n_renameButtonText(),
			})
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return EMPTY;
					const newName = promptResult.value;
					if (!newName) return EMPTY;

					console.log('You want to rename this file:', file, 'to', newName);
					return this.store.putObject$({ ...file, publicFilename: newName });
				})
			);
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this file?');
	private _i18n_deleteButtonText = this._translationService.prep('Delete File');
	public deleteFile(file: EntityFile) {
		return this._notificationService
			.confirm(this._i18n_deleteSentence(), undefined, {
				confirmButtonText: this._i18n_deleteButtonText(),
			})
			.closed.pipe(
				switchMap((confirmed) => {
					if (!confirmed) return EMPTY;

					console.log('You want to delete this file:', file);
					return this.store.deleteObject$(file.id);
				})
			);
	}

	///////////////////////////////////////////////
	//         resumable upload                  //
	///////////////////////////////////////////////

	/**
	 * Get the resumable url to upload a file.
	 * The app will be determine by the backend based on the url.
	 * @param fileName
	 * @param contentType
	 * @param fileSize
	 * @returns
	 */
	public getResumableUploadUrl$(fileName: string, contentType: string, fileSize?: number, alternative?: string, fileId?: string, folder?: { folderPath: string; folderForId: string; folderForKind: string }) {
		return this._requestService.post$<
			SimpleResponse<EntityFile>,
			{
				//
				fileName: string;
				contentType: string;
				fileSize?: number;
				alternative?: string;
				fileId?: string;
				// folder
				folderPath?: string;
				folderForId?: string;
				folderForKind?: string;
			}
		>('/api/files/storage/get-upload-details', {
			fileName,
			contentType,
			fileSize,
			alternative,
			fileId,
			// folder
			folderPath: folder?.folderPath,
			folderForId: folder?.folderForId,
			folderForKind: folder?.folderForKind,
		});
	}

	/**
	 * To call after the upload is done to update the file in the database.
	 * It will check if the file is uploaded.
	 * @param fileId
	 * @returns
	 */
	public updateAfterUpload$(fileId: string, force: boolean = false, duration?: number) {
		return this._requestService.post$<
			{ file: EntityFile; taskId: string },
			{
				fileId: string;
				duration?: number;
				force: boolean; // force the update even if the file is already uploaded
			}
		>('/api/files/storage/update-after-upload', { fileId, force, duration });
	}

	public recoverFromChunkUpload$(fileId: string, alternative: string | null) {
		return this._requestService.getBasic$<{ taskId: string }>('/api/files/storage/recover-from-chunks/' + fileId + '/' + alternative);
	}

	///////////////////////////////////////////////
	//         file URL                          //
	///////////////////////////////////////////////

	displayProgressBar(elementRef?: ElementRef<HTMLElement>): void {
		// _elementRef.nativeElement.ownerDocument.body
		const targetNode = elementRef?.nativeElement ?? document.body;

		// Ensure the percentage is between 0 and 100
		let percentage = (100 * this.allProgress.reduce((acc, curr) => acc + curr, 0)) / this.allProgress.length;
		// if not a number, made it 0
		if (isNaN(percentage)) {
			percentage = 0;
		}

		if (!this.backgroundDiv || !this.progressDiv || !this.textDiv) {
			// Create and style the background div
			this.backgroundDiv = this._renderer.createElement('div');
			this._renderer.setStyle(this.backgroundDiv, 'position', 'fixed');
			this._renderer.setStyle(this.backgroundDiv, 'bottom', '0');
			this._renderer.setStyle(this.backgroundDiv, 'left', '0');
			this._renderer.setStyle(this.backgroundDiv, 'width', '100%');
			this._renderer.setStyle(this.backgroundDiv, 'height', '0px');
			this._renderer.setStyle(this.backgroundDiv, 'background-color', 'grey');
			this._renderer.setStyle(this.backgroundDiv, 'z-index', '10000');
			// hide overflow
			this._renderer.setStyle(this.backgroundDiv, 'overflow', 'hidden');
			this._renderer.setStyle(this.backgroundDiv, 'transition', 'height 0.5s ease-in-out');

			// Create and style the progress div
			this.progressDiv = this._renderer.createElement('div');
			this._renderer.setStyle(this.progressDiv, 'height', '100%');
			this._renderer.setStyle(this.progressDiv, 'background-color', 'black');
			this._renderer.setStyle(this.progressDiv, 'width', '0');
			// make the width animation smooth
			this._renderer.setStyle(this.progressDiv, 'transition', 'width 0.5s ease-in-out');
			// center text
			// this._renderer.setStyle(this.progressDiv, 'display', 'flex');

			// Append progress div to background div, and background div to the body
			this._renderer.appendChild(this.backgroundDiv, this.progressDiv);
			this._renderer.appendChild(targetNode, this.backgroundDiv);

			// fix the height of the background div
			setTimeout(() => {
				this._renderer.setStyle(this.backgroundDiv, 'height', '20px');
			}, 0);

			// Create and style the text div
			this.textDiv = this._renderer.createElement('div');
			this._renderer.setStyle(this.textDiv, 'font-size', '10px');
			this._renderer.setStyle(this.textDiv, 'color', 'grey');
			this._renderer.setStyle(this.textDiv, 'margin', 'auto');
			this._renderer.setStyle(this.textDiv, 'text-align', 'center');
			this._renderer.setStyle(this.textDiv, 'width', '100%');
			this._renderer.setStyle(this.textDiv, 'height', '100%');
			this._renderer.setStyle(this.textDiv, 'display', 'flex');
			this._renderer.setStyle(this.textDiv, 'align-items', 'center');
			this._renderer.setStyle(this.textDiv, 'justify-content', 'center');
			this._renderer.appendChild(this.progressDiv, this.textDiv);
		}

		// Update the width of the progress div based on the percentage
		this._renderer.setStyle(this.progressDiv, 'width', `${percentage}%`);
		// append percentage text to the progress div
		const roundedPercentage = Math.round(percentage);
		this._renderer.setProperty(this.textDiv, 'innerText', `${roundedPercentage}%`);
	}

	removeProgressBar(elementRef?: ElementRef): void {
		const targetNode = elementRef?.nativeElement ?? document.body;

		if (this.backgroundDiv) {
			// fix the height of the background div
			this._renderer.setStyle(this.backgroundDiv, 'height', '0px');
			// remove the background div from the body
			setTimeout(() => {
				this._renderer.removeChild(targetNode, this.backgroundDiv);
				this.backgroundDiv = null;
				this.progressDiv = null;
				this.textDiv = null;
				this.allProgress = [];
			}, 1000);
		}
	}

	/** Called when uploading multiple file at a time or no need to control the fileId */
	handleFileList$(
		fileList: FileList | File[] | null,
		options?: {
			elementRef?: ElementRef<HTMLElement>;
			alternative?: string;
			fileId?: string;
			duration?: number;
			folder?: { folderPath: string; folderForId: string; folderForKind: string };
		}
	): Observable<RequestResponse<{ file: EntityFile; taskId: string }>[]> {
		if (!fileList) return EMPTY;
		const files = Array.from(fileList);

		if (files.length === 0) {
			console.log('No files selected');
			return EMPTY;
		}

		// if fileId is provided but we have multiple files, error:
		if (options?.fileId && files.length > 1) {
			console.error('You cannot provide a fileId and upload multiple files at the same time');
			return EMPTY;
		}
		// if duration is provided but we have multiple files, error:
		if (options?.duration && files.length > 1) {
			console.error('You cannot provide a duration and upload multiple files at the same time');
			return EMPTY;
		}

		this.isUploading = true;
		this.nbFilesToUpload = files.length;

		this.allProgress = [];

		const { elementRef, alternative, fileId, folder, duration } = options ?? {};

		this.displayProgressBar(elementRef);

		const uploadFiles$ = files.map((file, fileIndex) => {
			console.log('You are uploading this file:', file);
			const uploadFile$ = this.getResumableUploadUrl$(file.name, file.type, file.size, alternative, fileId, folder).pipe(
				// upload file to url
				switchMap((res) => {
					const fileDb = res.result?.data;
					if (!fileDb) return EMPTY;
					let url = fileDb.uploadUrl;
					if (!url) return EMPTY;
					url = url.replace(':4200', ':8000');
					const headers = new HttpHeaders().set(InterceptorSkipHeader, '');

					return combineLatest([
						of(fileDb),

						this._httpClient.put(url, file, {
							reportProgress: true,
							observe: 'events',
							headers,
						}),
					]);
				}),
				tap(([fileDb, event]) => {
					console.log('event', event);

					if (event.type === HttpEventType.UploadProgress) {
						const percentage = event.loaded / (event.total || 1);
						this.allProgress[fileIndex] = percentage <= 1 ? 0.8 * percentage : 0;
					} else if (event.type === HttpEventType.Response) {
						this.allProgress[fileIndex] = 0.8;
					} else {
						console.log('Upload event:', event);
					}
					this.displayProgressBar(elementRef);
				}),
				// switchMap if upload is over
				switchMap(([fileDb, event]) => {
					if (event.type === HttpEventType.Response) {
						this.nbFilesToUpload--;
						const updateAfterUpload$ = this.updateAfterUpload$(fileDb.id, undefined, duration).pipe(
							tap((uau) => {
								console.log('Update after upload for', fileDb.id, uau.result?.file);

								this.allProgress[fileIndex] = 1;
								this.displayProgressBar(elementRef);
							}),

							shareReplay(1)
						);

						let taskCount = 1;
						const taskProgress$ = updateAfterUpload$.pipe(
							switchMap((uau) => {
								const taskId = uau.result?.taskId;
								if (!taskId) return EMPTY;
								return this.getTaskProgress$(taskId, false);
							})
						);
						taskProgress$
							.pipe(
								tap((tp) => {
									console.log('Task progress polling:', { progress: tp?.progress, pollingCount: tp?.pollingCount, taskCount: tp?.taskCount });
									if (tp && tp.taskCount > taskCount) {
										console.log('New task detected:', { taskId: tp.id, taskCount: tp.taskCount });

										taskCount = tp.taskCount;
										this.store
											.getObjectById$$$(fileDb.id, true, true)
											.pipe(
												filter((lastFile): lastFile is EntityFile => !!lastFile),
												take(1),
												tap((lastFile) => {
													console.log('File updated:', lastFile);
												})
											)
											.subscribe();
									}
								}),

								finalize(() => {
									console.log('Task progress polling completed for file', fileDb.id);
									setTimeout(() => {
										this.store
											.getObjectById$$$(fileDb.id, true, true)
											.pipe(
												filter((lastFile): lastFile is EntityFile => !!lastFile),
												take(1),
												tap((lastFile) => {
													console.log('File updated after finalize:', lastFile);
												})
											)
											.subscribe();
									}, 1000);
								})
							)
							.subscribe();

						return interval(500).pipe(
							tap(() => {
								// update the progress bar
								console.log('Update progress bar while waiting for file update');
								this.allProgress[fileIndex] = Math.max(0.99, this.allProgress[fileIndex] + (1 - this.allProgress[fileIndex]) * 0.1);
								this.displayProgressBar();
							}),
							skipUntil(updateAfterUpload$), // use skipUntil to wait for updateAfterUpload$ to emit
							take(1),
							switchMap(() => updateAfterUpload$) // switchMap to the updateAfterUpload$ observable
						);
					}
					console.log('returning never while uploading for', fileDb);

					return NEVER;
				})
			);
			return uploadFile$;
		});

		return combineLatest(uploadFiles$).pipe(
			finalize(() => {
				console.log('(finalize) Upload is over');
				this.isUploading = false;
				this.removeProgressBar(elementRef);
			})
		);
	}

	// listen to before unload from an angular service

	unloadNotification($event: any): void {
		if (this.isUploading) {
			$event.returnValue = 'Still uploading ' + this.nbFilesToUpload + ' file' + (this.nbFilesToUpload > 1 ? 's' : '') + '. Are you sure you want to leave?';
		}
	}

	/**
	 * Get the final URL after all redirects
	 * @param initialUrl
	 * @returns
	 */
	async getFinalUrl(initialUrl: string) {
		try {
			const response = await fetch(initialUrl, { method: 'HEAD', redirect: 'follow' });
			return response.url; // The final URL after all redirects
		} catch (error) {
			console.error('Failed to fetch URL:', error);
			return initialUrl;
		}
	}

	/**
	 * Keep the last 20 text request results in cache to avoid fetching the same URL multiple times
	 */
	textContentCache = new Map<string, string>();
	async fetchTextContent(url: string) {
		if (this.textContentCache.has(url)) {
			return this.textContentCache.get(url);
		}
		try {
			const response = await fetch(url, { redirect: 'follow' });
			const text = await response.text();
			this.textContentCache.set(url, text);
			if (this.textContentCache.size > 20) {
				// remove the first element
				const keys = Array.from(this.textContentCache.keys());
				this.textContentCache.delete(keys[0]);
			}
			return text;
		} catch (error) {
			console.error('(fetchTextContent) Failed to fetch URL:', error);
			return undefined;
		}
	}

	getChunkUploadUrl$(fileId: string, alternative: string, startBytes: number, endBytes: number) {
		return this._requestService.getBasic$<{ uploadUrl: string }>(`/api/files/storage/get-chunk-upload-url/${fileId}/${alternative}/${startBytes}/${endBytes}`);
	}

	getTaskProgress$(taskId: string, debug = false): Observable<TaskProgressResponse | undefined> {
		return new Observable<TaskProgressResponse | undefined>((subscriber) => {
			let pollingCount = 0;
			let stopped = false;
			let currentTaskId = taskId;
			let taskCount = 1;
			const poll = () => {
				if (stopped) return;

				if (debug) console.log(`[getTaskProgress$] Polling taskId: ${currentTaskId}, count: ${pollingCount}`);
				this._requestService.getBasic$<{ id: string; progress: number; started?: boolean; completed?: boolean; ended?: boolean; failed?: boolean; artifactTaskId?: string }>(`/api/tasks/processing/${currentTaskId}/progress`).subscribe({
					next: (res) => {
						const result = res.result;
						if (debug) console.log(`[getTaskProgress$] Received result for taskId: ${currentTaskId}`, result);
						if (!result) {
							if (debug) console.log(`[getTaskProgress$] No result for taskId: ${currentTaskId}, completing.`);
							subscriber.complete();
							return;
						}
						if (result.ended || result.completed || result.failed) {
							if (result.artifactTaskId) {
								taskCount++;
								if (debug) console.log(`[getTaskProgress$] TaskId ${currentTaskId} ended, new task to follow: artifactTaskId=${result.artifactTaskId}, taskCount=${taskCount}`);
								currentTaskId = result.artifactTaskId;
								pollingCount = 0; // reset counter for new task
								poll();
								return;
							}

							if (debug) console.log(`[getTaskProgress$] TaskId ${currentTaskId} ended, emitting and completing.`);
							subscriber.next({ ...res.result, pollingCount, taskCount });
							subscriber.complete();
							return;
						}

						if (debug) console.log(`[getTaskProgress$] TaskId ${currentTaskId} not ended, emitting progress.`);
						subscriber.next({ ...res.result, pollingCount, taskCount });
						pollingCount++;
						let delay = 1000;
						if (pollingCount > 30) {
							if (debug) console.log(`[getTaskProgress$] Max poll count reached for taskId: ${currentTaskId}, completing.`);
							subscriber.complete();
							return;
						} else if (pollingCount > 20) {
							delay = 30000;
							if (debug) console.log(`[getTaskProgress$] Polling interval set to 30s for taskId: ${currentTaskId}`);
						} else if (pollingCount > 10) {
							delay = 5000;
							if (debug) console.log(`[getTaskProgress$] Polling interval set to 5s for taskId: ${currentTaskId}`);
						}
						setTimeout(poll, delay);
					},
					error: (err) => {
						console.error(`[getTaskProgress$] Error polling taskId: ${currentTaskId}`, err);
						subscriber.error(err);
					},
				});
			};
			poll();
			return () => {
				stopped = true;
			};
		});
	}
}
