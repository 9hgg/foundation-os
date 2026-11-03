import type { AlternativeFormat, EntityFile, FileConfig } from './file.model';

describe('file.model', () => {
	it('accepts the minimal persisted file resource shape', () => {
		const file = {
			id: 'file-1',
			inStorage: false,
			extra: {},
			config: {},
		} satisfies EntityFile;

		expect(file).toEqual({
			id: 'file-1',
			inStorage: false,
			extra: {},
			config: {},
		});
	});

	it('models uploaded media metadata and generated alternative formats', () => {
		const alternative = {
			alternativeFilename: 'interview-preview.webm',
			description: 'Browser-friendly preview',
			extension: 'webm',
			kind: 'video',
			mime: 'video/webm',
			presignedUrl: 'https://storage.example/preview',
			presignedUrlExpiration: 1_800_000_000,
			size: 2048,
			storageSuffix: 'preview',
		} satisfies AlternativeFormat;
		const file = {
			id: 'file-2',
			originalFilename: 'interview.mov',
			publicFilename: 'Interview',
			description: 'Recorded interview',
			extension: 'mov',
			extensionClient: 'mov',
			kind: 'video',
			mimeClient: 'video/quicktime',
			sizeClient: '4096',
			unprocessable: false,
			mime: 'video/quicktime',
			size: 4096,
			storageType: 'gcp',
			storageId: 'bucket/file-2',
			storageFolderPath: 'interviews',
			inStorage: true,
			uploadUrl: 'https://storage.example/upload',
			extra: {
				duration: 42,
				hasAudio: true,
				hasVideo: true,
				channels: 2,
				codecAudio: 'aac',
				codecVideo: 'h264',
				height: 1080,
				width: 1920,
				sampleRate: 48_000,
				alternativeFormats: [alternative],
				hash: 'abc123',
			},
			appId: 'gadzapp',
			config: { clientDuration: 41.5 },
		} satisfies EntityFile;

		expect(file.extra.alternativeFormats[0]).toBe(alternative);
		expect(file.extra.hasAudio).toBe(true);
		expect(file.config.clientDuration).toBe(41.5);
	});

	it('allows custom derivative kinds and nullable hashes', () => {
		const customFormat = {
			alternativeFilename: 'document-search.txt',
			description: 'Extracted searchable text',
			extension: 'txt',
			kind: 'search-index',
			mime: 'text/plain',
		} satisfies AlternativeFormat;
		const config = { clientDuration: 0 } satisfies FileConfig;
		const file = {
			id: 'file-3',
			inStorage: true,
			extra: { hash: null, alternativeFormats: [customFormat] },
			config,
		} satisfies EntityFile;

		expect(file.extra.hash).toBeNull();
		expect(file.extra.alternativeFormats[0].kind).toBe('search-index');
	});
});
