import { Resource } from '@foundation/utils';

export interface AlternativeFormat {
	alternativeFilename: string;
	description: string;
	extension: string;
	kind: 'audio' | 'video' | 'image' | string;
	mime: string;
	presignedUrl?: string;
	presignedUrlExpiration?: number;
	size?: number;
	storageSuffix?: string;
}

export interface FileConfig {
	clientDuration?: number;
}

export interface EntityFile extends Resource {
	originalFilename?: string;
	publicFilename?: string;
	description?: string;

	/** extension is what comes after the last dot in the filename */
	extension?: string;
	/** to use as default until extension is available */
	extensionClient?: string;
	/** audio, video, image, pdf, ... */
	kind?: string;
	mimeClient?: string;
	/** to use as default until size is available */
	sizeClient?: string;

	/** undefined until we have a way to check if a file is unprocessable */
	unprocessable?: boolean;
	mime?: string;
	size?: number;

	storageType?: string;
	storageId?: string;
	storageFolderPath?: string;
	inStorage: boolean;
	uploadUrl?: string;

	extra: {
		duration?: number;
		hasAudio?: boolean;
		hasVideo?: boolean;
		channels?: number;
		codecAudio?: string;
		codecVideo?: string;
		height?: number;
		width?: number;
		sampleRate?: number;
		alternativeFormats?: AlternativeFormat[];
	};
	appId?: string;

	config: FileConfig;
}
