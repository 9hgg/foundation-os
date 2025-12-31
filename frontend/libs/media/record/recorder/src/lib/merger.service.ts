export interface DrawFunction {
	(context: CanvasRenderingContext2D, frame: CanvasImageSource, done: () => void): void;
}

export interface AudioEffect {
	(sourceNode: MediaStreamAudioSourceNode, destinationNode: AudioNode): void;
}

export interface ConstructorOptions {
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	clearRect: boolean;
	audioContext: AudioContext;
}

export interface AddStreamOptions {
	/** horizontal offset (from left) */
	horizontalOffset: number;
	/** vertical offset (from top) */
	verticalOffset: number;
	customMaxWidth: number;
	customMaxHeight: number;
	index: number;
	mute: boolean;
	muted: boolean;
	draw: DrawFunction;
	audioEffect: AudioEffect;
	keepRatio: boolean;
	useComputedVideoDimsForCanvas: boolean;
}

interface ExtendedStream extends Partial<AddStreamOptions> {
	isData?: boolean;
	hasVideo?: boolean;
	hasAudio?: boolean;
	audioSource?: MediaStreamAudioSourceNode;
	audioOutput?: AudioNode | GainNode;
	videoElement?: HTMLVideoElement;
	id?: string;

	index: number; // force number
	mediaStream: MediaStream;
}

/**
 * Merges the video of multiple MediaStreams. Also merges the audio via the WebAudio API.
 *
 * - Send multiple videos over a single WebRTC MediaConnection
 * - Hotswap streams without worrying about renegotation or delays
 * - Crop, scale, and rotate live video
 * - Add crazy effects through the canvas API
 */
export class VideoStreamMerger {
	/**
	 * Width of the merged MediaStream
	 */
	public canvasWidth = 200;

	/**
	 * Height of the merged MediaStream
	 */
	public canvasHeight = 50;
	public fps = 30;
	private _streams: ExtendedStream[] = [];
	private _frameCount = 0;

	public clearRect = true;
	public started = false;

	/**
	 * The resulting merged MediaStream. Only available after calling merger.start()
	 * Never has more than one Audio and one Video track.
	 */
	public result: MediaStream | null = null;
	public supported: boolean | null = null;

	private _canvas: HTMLCanvasElement | null = null;
	private _ctx: CanvasRenderingContext2D | null = null;
	private _videoSyncDelayNode: DelayNode | null = null;
	private _audioDestination: MediaStreamAudioDestinationNode | null = null;
	private _audioCtx: AudioContext | null = null;
	private _animationFrame: number | null = null;

	constructor(options: Partial<ConstructorOptions> = {}) {
		const audioSupport = !!(AudioContext && new AudioContext().createMediaStreamDestination);
		const canvasSupport = !!document.createElement('canvas').captureStream;
		const supported = (this.supported = audioSupport && canvasSupport);

		if (!supported) {
			return;
		}

		this.setOptions(options);

		const audioCtx = (this._audioCtx = new AudioContext());
		const audioDestination = (this._audioDestination = audioCtx?.createMediaStreamDestination());

		// delay node for video sync
		this._videoSyncDelayNode = audioCtx.createDelay(5.0);
		this._videoSyncDelayNode.connect(audioDestination);

		this._setupConstantNode(); // HACK for wowza #7, #10

		this.started = false;
		this.result = null;

		this._backgroundAudioHack();
	}

	setOptions(options: Partial<ConstructorOptions> = {}): void {
		this._audioCtx = options.audioContext || new AudioContext();
		this.canvasWidth = options.canvasWidth ?? this.canvasWidth;
		this.canvasHeight = options.canvasHeight ?? this.canvasHeight;
		this.fps = options.fps ?? this.fps;
		this.clearRect = options.clearRect === undefined ? true : options.clearRect;
	}

	/**
	 * Change the size of the canvas and the output video track.
	 */
	setOutputSize(width: number, height: number): void {
		this.canvasWidth = width;
		this.canvasHeight = height;

		if (this._canvas) {
			this._canvas.setAttribute('width', this.canvasWidth.toString());
			this._canvas.setAttribute('height', this.canvasHeight.toString());
		}
	}

	/**
	 * Get the WebAudio AudioContext being used by the merger.
	 */
	getAudioContext(): AudioContext | null {
		return this._audioCtx;
	}

	/**
	 * Get the MediaStreamDestination node that is used by the merger.
	 */
	getAudioDestination(): MediaStreamAudioDestinationNode | null {
		return this._audioDestination;
	}

	getCanvasContext(): CanvasRenderingContext2D | null {
		return this._ctx;
	}

	private _backgroundAudioHack() {
		if (this._audioCtx) {
			// stop browser from throttling timers by playing almost-silent audio
			const source = this._createConstantSource();
			const gainNode = this._audioCtx.createGain();
			if (gainNode && source) {
				gainNode.gain.value = 0.001; // required to prevent popping on start
				source.connect(gainNode);
				gainNode.connect(this._audioCtx.destination);
				source.start();
			}
		}
	}

	private _setupConstantNode() {
		if (this._audioCtx && this._videoSyncDelayNode) {
			const constantAudioNode = this._createConstantSource();

			if (constantAudioNode) {
				constantAudioNode.start();

				const gain = this._audioCtx.createGain(); // gain node prevents quality drop
				gain.gain.value = 0;

				constantAudioNode.connect(gain);
				gain.connect(this._videoSyncDelayNode);
			}
		}
	}

	private _createConstantSource() {
		if (this._audioCtx) {
			if (this._audioCtx.createConstantSource) {
				return this._audioCtx.createConstantSource();
			}

			// not really a constantSourceNode, just a looping buffer filled with the offset value
			const constantSourceNode = this._audioCtx.createBufferSource();
			const constantBuffer = this._audioCtx.createBuffer(1, 1, this._audioCtx.sampleRate);
			const bufferData = constantBuffer.getChannelData(0);
			bufferData[0] = 0 * 1200 + 10;
			constantSourceNode.buffer = constantBuffer;
			constantSourceNode.loop = true;

			return constantSourceNode;
		}
		return undefined;
	}

	/**
	 * Update the z-index (draw order) of an already added stream or data object. Identical to the index option.
	 * If you have added the same MediaStream multiple times, all instances will be updated.
	 */
	updateIndex(mediaStream: MediaStream, index: number): void {
		index = index == null ? 0 : index;

		for (let i = 0; i < this._streams.length; i++) {
			if (mediaStream.id === this._streams[i].id) {
				this._streams[i].index = index;
			}
		}
		this._sortStreams();
	}

	private _sortStreams() {
		this._streams = this._streams.sort((a, b) => a.index - b.index);
	}

	/**
	 * Add a MediaStream to be merged. Use an id string if you only want to provide an effect.
	 * The order that streams are added matters. Streams placed earlier will be behind later streams (use the index option to change this behaviour.)
	 */
	addStream(mediaStream: MediaStream, opts?: Partial<AddStreamOptions>): void {
		console.log('%c[VideoStreamMerger](addStream)', 'color:red', mediaStream, opts);

		const stream: ExtendedStream = { ...opts, index: 0, mediaStream: mediaStream };

		stream.isData = false;
		stream.horizontalOffset = opts?.horizontalOffset ?? 0;
		stream.verticalOffset = opts?.verticalOffset ?? 0;
		stream.customMaxWidth = opts?.customMaxWidth;
		stream.customMaxHeight = opts?.customMaxHeight;
		stream.draw = opts?.draw;
		stream.mute = opts?.mute ?? opts?.muted ?? false;
		stream.audioEffect = opts?.audioEffect;
		stream.index = opts?.index ?? 0;
		stream.keepRatio = opts?.keepRatio ?? false;
		stream.useComputedVideoDimsForCanvas = opts?.useComputedVideoDimsForCanvas ?? false;
		stream.hasVideo = mediaStream.getVideoTracks().length > 0;
		stream.hasAudio = mediaStream.getAudioTracks().length > 0;

		if (stream.hasVideo) {
			// If it is the same MediaStream, we can reuse our video element (and ignore sound)
			let videoElement: HTMLVideoElement | undefined = undefined;
			for (let i = 0; i < this._streams.length; i++) {
				if (this._streams[i].id === mediaStream.id) {
					videoElement = this._streams[i].videoElement;
				}
			}

			if (!videoElement) {
				videoElement = document.createElement('video');
				videoElement.autoplay = true;
				videoElement.muted = true;
				videoElement.playsInline = true;
				videoElement.srcObject = mediaStream;
				videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; pointer-events: none; opacity:1;');
				// document.body.appendChild(videoElement);

				const res = videoElement.play();
				res.catch(null);
			}

			stream.videoElement = videoElement;

			// if (opts?.useVideoDimsForCanvas) {
			// 	stream.customWidth = videoElement.videoWidth;
			// 	stream.customHeight = videoElement.videoHeight;
			// }
		} else {
			console.warn('[VideoStreamMerger](addStream) No video tracks found in MediaStream. Will not render video.');
		}

		if (stream.hasAudio && this._audioCtx && !stream.mute) {
			stream.audioSource = this._audioCtx.createMediaStreamSource(mediaStream);
			const gainNode = this._audioCtx.createGain(); // Intermediate gain node
			gainNode.gain.value = 1;
			stream.audioOutput = gainNode;
			if (stream.audioEffect && stream.audioOutput) {
				stream.audioEffect(stream.audioSource, stream.audioOutput);
			} else {
				stream.audioSource.connect(stream.audioOutput); // Default is direct connect
			}
			if (this._videoSyncDelayNode) stream.audioOutput.connect(this._videoSyncDelayNode);
		}

		stream.id = mediaStream.id;
		this._streams.push(stream);

		console.log('[VideoStreamMerger](addStream) Added stream:', mediaStream.id, stream, this._streams);
		

		this._sortStreams();
	}

	// /**
	//  * Remove a MediaStream from the merging. You may also use the ID of the stream.
	//  * If you have added the same MediaStream multiple times, all instances will be removed.
	//  */
	// removeStream(mediaStream: MediaStream | string | { id: string }): void {
	//     console.log();

	// 	if (typeof mediaStream === 'string') {
	// 		mediaStream = {
	// 			id: mediaStream,
	// 		};
	// 	}

	// 	for (let i = 0; i < this._streams.length; i++) {
	// 		const stream = this._streams[i];
	// 		if (mediaStream.id === stream.id) {
	// 			if (stream.audioSource) {
	// 				stream.audioSource = null;
	// 			}
	// 			if (stream.audioOutput) {
	// 				stream.audioOutput.disconnect(this._videoSyncDelayNode);
	// 				stream.audioOutput = null;
	// 			}
	// 			if (stream.element) {
	// 				stream.element.remove();
	// 			}
	// 			this._streams[i] = null;
	// 			this._streams.splice(i, 1);
	// 			i--;
	// 		}
	// 	}
	// }

	private _requestAnimationFrame(callback: () => void): number {
		return window.setTimeout(callback, 1000 / 60);
	}

	private _cancelAnimationFrame(timeoutId: number) {
		return clearTimeout(timeoutId);
	}

	/**
	 * Start the merging and create merger.result.
	 * You can call this any time, but you only need to call it once.
	 * You will still be able to add/remove streams and the result stream will automatically update.
	 */

	start(): void {
		console.log('[mergerService](start)');

		this._audioCtx?.resume();

		// Hidden canvas element for merging
		this._canvas = document.createElement('canvas');
		this._canvas.setAttribute('width', this.canvasWidth.toString());
		this._canvas.setAttribute('height', this.canvasHeight.toString());
		// this._canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none'); // Push off screen
		// this._canvas.setAttribute(
		// 	'style',
		// 	'position:fixed; left: 0px; top:0px; width:1080px; height:675px; pointer-events: none; opacity:1;'
		// );
		// document.body.appendChild(this._canvas);
		this._ctx = this._canvas.getContext('2d');
		// if (this._ctx) this._ctx.imageSmoothingEnabled = false;

		console.log({ width: this.canvasWidth.toString(), height: this.canvasHeight.toString() });

		this.started = true;
		this._animationFrame = this._requestAnimationFrame(this._draw.bind(this));

		// Add video
		this.result = this._canvas?.captureStream(this.fps) || null;

		// Remove "dead" audio track
		const deadTrack = this.result?.getAudioTracks()[0];
		if (deadTrack) {
			this.result?.removeTrack(deadTrack);
		}

		// Add audio
		const audioTracks = this._audioDestination?.stream.getAudioTracks();
		if (audioTracks && audioTracks.length) {
			this.result?.addTrack(audioTracks[0]);
		}
	}

	private _updateAudioDelay(delayInMs: number) {
		if (this._videoSyncDelayNode && this._audioCtx) {
			this._videoSyncDelayNode.delayTime.setValueAtTime(delayInMs / 1000, this._audioCtx.currentTime);
		}
	}

	private _draw() {
		if (!this.started) {
			return;
		}

		this._frameCount++;

		// update video processing delay every 60 frames
		let t0 = 0;
		if (this._frameCount % 60 === 0) {
			t0 = performance.now();
		}

		let awaiting = this._streams.length;
		const done = () => {
			awaiting--;
			if (awaiting <= 0) {
				if (this._frameCount % 60 === 0) {
					const t1 = performance.now();
					this._updateAudioDelay(t1 - t0);
				}
				this._requestAnimationFrame(this._draw.bind(this));
			}
		};

		if (this.clearRect) {
			this._ctx?.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
		}
		this._streams.forEach((stream) => {
			if (stream.draw && this._ctx && stream.videoElement) {
				// custom frame transform
				stream.draw(this._ctx, stream.videoElement, done);
			} else if (!stream.isData && stream.hasVideo && stream.videoElement) {
				this._drawVideo(stream.videoElement, stream);
				done();
			} else {
				done();
			}
		});

		if (this._streams.length === 0) {
			done();
		}
	}

	private _drawVideo(element: HTMLVideoElement, stream: ExtendedStream) {
		// default draw function

		const videoElement = stream.videoElement;
		if (!videoElement) return;

		const horizontalOffset = stream.horizontalOffset ?? 0;
		const verticalOffset = stream.verticalOffset ?? 0;

		const maxWidthToUse = stream.customMaxWidth ?? this.canvasWidth;
		const maxHeightToUse = stream.customMaxHeight ?? this.canvasHeight;

		// console.log('init', { horizontalOffset, verticalOffset, maxWidthToUse, maxHeightToUse });

		// get drawing dims
		let widthToUse = maxWidthToUse;
		let heightToUse = maxHeightToUse;

		if (stream.keepRatio) {
			// console.log('KEEP RATIO');

			let widthRatio = 1;
			let heightRatio = 1;
			if (videoElement.videoWidth > 0 && maxWidthToUse > 0) widthRatio = maxWidthToUse / videoElement.videoWidth;
			if (videoElement.videoHeight > 0 && maxHeightToUse > 0) heightRatio = maxHeightToUse / videoElement.videoHeight;

			const ratio = Math.min(widthRatio, heightRatio);

			widthToUse = videoElement.videoWidth * ratio;
			heightToUse = videoElement.videoHeight * ratio;

			// console.log({ widthRatio, heightRatio, widthToUse, heightToUse });

			// // const ratio = Math.min(this.canvasHeight / maxHeightToUse, this.canvasWidth / maxWidthToUse);
			// console.log({ widthToUse: maxWidthToUse, heightToUse: maxHeightToUse, ratio });

			// // const positionX = (this.canvasWidth - widthToUse * ratio) / 2;
			// // const positionY = (this.canvasHeight - heightToUse * ratio) / 2;

			// try {
			// 	this._ctx?.drawImage(
			// 		element,
			// 		horizontalOffset,
			// 		verticalOffset,
			// 		Math.floor(maxWidthToUse / ratio),
			// 		Math.floor(maxHeightToUse / ratio)
			// 	);
			// } catch (err) {
			// 	// Ignore error possible "IndexSizeError (DOM Exception 1): The index is not in the allowed range." due Safari bug.
			// 	console.error(err);
			// }
		}

		// update canvas dim if needed
		if (stream.useComputedVideoDimsForCanvas) {
			// widthToUse = videoElement.videoWidth;
			// heightToUse = videoElement.videoHeight;
			this.setOutputSize(widthToUse, heightToUse);
			// console.log('USE VIDEO DIMS, Setting new canvas dims:', {
			// 	canvasWidth: this.canvasWidth,
			// 	canvasHeight: this.canvasHeight,
			// });
		}

		// else {
		// 	console.log('NOT keeping ratio');

		// 	const height = stream.customMaxHeight ?? this.canvasHeight;
		// 	const width = stream.customMaxWidth ?? this.canvasWidth;
		// }

		try {
			if (stream.useComputedVideoDimsForCanvas) {
				this._ctx?.drawImage(element, 0, 0);
			} else this._ctx?.drawImage(element, horizontalOffset, verticalOffset, widthToUse, heightToUse);
		} catch (err) {
			// Ignore error possible "IndexSizeError (DOM Exception 1): The index is not in the allowed range." due Safari bug.
			console.error(err);
		}
	}

	/**
	 * Clean up everything and destroy the result stream.
	 */
	stop(): void {
		console.log('[merger]](stop)');

		this.started = false;

		this._canvas = null;
		this._ctx = null;
		this._streams.forEach((stream) => {
			if (stream.videoElement) {
				stream.videoElement.remove();
			}
			stream.mediaStream.getTracks().forEach((track) => track.stop());
		});
		this._streams = [];
		this._audioCtx?.suspend();

		if (this._animationFrame) {
			this._cancelAnimationFrame(this._animationFrame);
			this._animationFrame = null;
		}

		this.result?.getTracks().forEach((t) => {
			t.stop();
		});

		this.result = null;
	}

	destroy() {
		this._audioCtx?.close();
		this._audioCtx = null;
		this._audioDestination = null;
		this._videoSyncDelayNode = null;
		this.stop();
	}
}
