export const MEDIARECORDER_EVENTS = [
	//
	'dataavailable',
	'error',
	'pause',
	'resume',
	'start',
	'stop',
	'warning',
];

export const RECORDRTC_MIMETYPES = ['audio/webm', 'audio/webm;codecs=pcm', 'video/mp4', 'video/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm;codecs=h264', 'video/x-matroska;codecs=avc1', 'video/mpeg', 'audio/wav', 'audio/ogg'];

export function getSupportedVideoMimeTypes() {
	const VIDEO_TYPES = ['webm', 'ogg', 'mp4', 'x-matroska'];
	const VIDEO_CODECS = ['vp9', 'vp9.0', 'vp8', 'vp8.0', 'avc1', 'av1', 'h265', 'h.265', 'h264', 'h.264', 'opus'];

	const supportedTypes: string[] = [];
	VIDEO_TYPES.forEach((videoType) => {
		const type = `video/${videoType}`;
		VIDEO_CODECS.forEach((codec) => {
			const variations = [`${type};codecs=${codec}`, `${type};codecs:${codec}`, `${type};codecs=${codec.toUpperCase()}`, `${type};codecs:${codec.toUpperCase()}`, `${type}`];
			variations.forEach((variation) => {
				if (MediaRecorder.isTypeSupported(variation) && RECORDRTC_MIMETYPES.includes(variation)) supportedTypes.push(variation);
			});
		});
	});

	return supportedTypes;
}

export function getSupportedAudioMimeTypes(ignoreRecorderRtc: boolean = false, debug = false): string[] {
	const AUDIO_TYPES = ['ogg', 'opus', 'mp4', 'flac', 'webm', 'isac', 'wav', 'x-wav', 'mpeg', 'aac', 'aacp', 'x-caf', 'x-matroska', 'invalid'];
	const AUDIO_CODECS = ['opus', 'vorbis', 'pcm'];

	const supportedTypes: string[] = [];
	AUDIO_TYPES.forEach((audioType) => {
		const type = `audio/${audioType}`;
		AUDIO_CODECS.forEach((codec) => {
			const variations = [`${type};codecs=${codec}`, `${type};codecs:${codec}`, `${type};codecs=${codec.toUpperCase()}`, `${type};codecs:${codec.toUpperCase()}`, `${type}`];
			variations.forEach((variation) => {
				if (MediaRecorder.isTypeSupported(variation) && (ignoreRecorderRtc || RECORDRTC_MIMETYPES.includes(variation))) {
					supportedTypes.push(variation);
				}
			});
		});
	});

	if (supportedTypes.length === 0) {
		if (debug) console.warn('No supported audio mimetype found overlapping RecorderRTC mimetypes.');
		return getSupportedAudioMimeTypes(true, debug);
	}
	return supportedTypes;
}
