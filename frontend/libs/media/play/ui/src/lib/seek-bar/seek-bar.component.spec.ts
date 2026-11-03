import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeekBarComponent } from './seek-bar.component';

function makeTrack(rect: Partial<DOMRect> = { left: 0, width: 200 }): HTMLDivElement {
	const track = document.createElement('div');
	track.getBoundingClientRect = () => ({ left: 0, width: 200, ...rect }) as DOMRect;
	(track as any).setPointerCapture = vi.fn();
	(track as any).releasePointerCapture = vi.fn();
	(track as any).hasPointerCapture = vi.fn().mockReturnValue(true);
	return track;
}

describe('SeekBarComponent', () => {
	function create(overrides: Partial<{ currentTime: number; duration: number; bufferedEnd: number; disabled: boolean; keyboardStepSeconds: number; keyboardPageSeconds: number }> = {}, track = makeTrack()): SeekBarComponent {
		const component = TestBed.runInInjectionContext(() => new SeekBarComponent());
		Object.defineProperty(component, 'currentTime', { value: signal(overrides.currentTime ?? 0) });
		Object.defineProperty(component, 'duration', { value: signal(overrides.duration ?? 0) });
		Object.defineProperty(component, 'bufferedEnd', { value: signal(overrides.bufferedEnd ?? 0) });
		Object.defineProperty(component, 'disabled', { value: signal(overrides.disabled ?? false) });
		Object.defineProperty(component, 'keyboardStepSeconds', { value: signal(overrides.keyboardStepSeconds ?? 5) });
		Object.defineProperty(component, 'keyboardPageSeconds', { value: signal(overrides.keyboardPageSeconds ?? 10) });
		Object.defineProperty(component, 'trackRef', { value: signal(new ElementRef(track)) });
		return component;
	}

	describe('remainingTime', () => {
		it('counts down what is left to play', () => {
			expect(create({ currentTime: 42, duration: 195 }).remainingTime()).toBe(153);
		});

		it('stops at zero rather than counting into the negative', () => {
			expect(create({ currentTime: 200, duration: 195 }).remainingTime()).toBe(0);
		});

		it('has nothing to count down while the duration is unknown', () => {
			expect(create({ currentTime: 0, duration: 0 }).remainingTime()).toBe(0);
		});
	});

	describe('durationValue', () => {
		it('is zero for a non-finite duration', () => {
			expect(create({ duration: Infinity }).durationValue()).toBe(0);
		});

		it('is zero for a negative duration', () => {
			expect(create({ duration: -5 }).durationValue()).toBe(0);
		});

		it('passes through a strictly positive finite duration', () => {
			expect(create({ duration: 120 }).durationValue()).toBe(120);
		});
	});

	describe('progress / buffered percent', () => {
		it('is zero percent with no duration', () => {
			const component = create({ currentTime: 10, duration: 0 });
			expect(component.progressPercent()).toBe(0);
		});

		it('computes the percentage of playback progress', () => {
			const component = create({ currentTime: 50, duration: 200 });
			expect(component.progressPercent()).toBe(25);
		});

		it('clamps progress to 100 for an out-of-range current time', () => {
			const component = create({ currentTime: 999, duration: 200 });
			expect(component.progressPercent()).toBe(100);
		});

		it('computes the buffered percentage', () => {
			const component = create({ bufferedEnd: 100, duration: 200 });
			expect(component.bufferedPercent()).toBe(50);
		});
	});

	describe('showWaveform / progressRatio', () => {
		it('does not show the waveform without a mediaUrl', () => {
			const component = create();
			expect(component.showWaveform()).toBe(false);
		});

		it('shows the waveform once mediaUrl is set', () => {
			const component = create();
			Object.defineProperty(component, 'mediaUrl', { value: signal('sp://track') });
			expect(component.showWaveform()).toBe(true);
		});

		it('derives the played ratio from the progress percent', () => {
			const component = create({ currentTime: 50, duration: 200 });
			expect(component.progressRatio()).toBe(0.25);
		});
	});

	describe('ariaValueText', () => {
		it('formats minutes and seconds, zero-padded', () => {
			const component = create({ currentTime: 65, duration: 200 });
			expect(component.ariaValueText()).toBe('1:05 of 3:20');
		});
	});

	describe('tooltip state', () => {
		it('is hidden when neither scrubbing nor hovering', () => {
			const component = create({ currentTime: 10, duration: 100 });
			expect(component.tooltipVisible()).toBe(false);
			expect(component.tooltipPercent()).toBe(0);
			expect(component.tooltipTime()).toBe(0);
		});

		it('follows the pointer while hovering, without scrubbing', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerMove({ clientX: 30 } as PointerEvent);

			expect(component.tooltipVisible()).toBe(true);
			expect(component.tooltipPercent()).toBe(30);
			expect(component.tooltipTime()).toBe(30);
		});

		it('shows the live scrub position while dragging, ignoring hover', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerDown({ clientX: 40, pointerId: 1, preventDefault: vi.fn() } as unknown as PointerEvent);

			expect(component.tooltipVisible()).toBe(true);
			expect(component.tooltipPercent()).toBe(40);
			expect(component.tooltipTime()).toBe(40);
		});
	});

	describe('pointer interaction', () => {
		it('does nothing when disabled', () => {
			const track = makeTrack();
			const component = create({ duration: 100, disabled: true }, track);
			const preventDefault = vi.fn();
			component.onPointerDown({ clientX: 50, pointerId: 1, preventDefault } as unknown as PointerEvent);

			expect(component.isScrubbing()).toBe(false);
			expect(preventDefault).not.toHaveBeenCalled();
		});

		it('does nothing without a positive duration', () => {
			const component = create({ duration: 0 });
			const preventDefault = vi.fn();
			component.onPointerDown({ clientX: 50, pointerId: 1, preventDefault } as unknown as PointerEvent);
			expect(component.isScrubbing()).toBe(false);
		});

		it('starts scrubbing on pointer down, capturing the pointer and emitting scrubStart/scrubbing', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			const scrubStart = vi.fn();
			const scrubbing = vi.fn();
			component.scrubStart.subscribe(scrubStart);
			component.scrubbing.subscribe(scrubbing);
			const preventDefault = vi.fn();

			component.onPointerDown({ clientX: 25, pointerId: 7, preventDefault } as unknown as PointerEvent);

			expect(component.isScrubbing()).toBe(true);
			expect(component.displayTime()).toBe(25);
			expect(scrubStart).toHaveBeenCalled();
			expect(scrubbing).toHaveBeenCalledWith(25);
			expect((track as any).setPointerCapture).toHaveBeenCalledWith(7);
			expect(preventDefault).toHaveBeenCalled();
		});

		it('updates the scrub position on pointer move while dragging', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerDown({ clientX: 10, pointerId: 1, preventDefault: vi.fn() } as unknown as PointerEvent);

			const scrubbing = vi.fn();
			component.scrubbing.subscribe(scrubbing);
			component.onPointerMove({ clientX: 70 } as PointerEvent);

			expect(component.displayTime()).toBe(70);
			expect(scrubbing).toHaveBeenCalledWith(70);
		});

		it('sets the hover ratio on pointer move when not scrubbing and interactive', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerMove({ clientX: 90 } as PointerEvent);
			expect(component.tooltipPercent()).toBe(90);
		});

		it('ignores pointer move when not interactive and not scrubbing', () => {
			const component = create({ duration: 0 });
			component.onPointerMove({ clientX: 90 } as PointerEvent);
			expect(component.tooltipVisible()).toBe(false);
		});

		it('commits the seek and releases pointer capture on pointer up', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerDown({ clientX: 10, pointerId: 3, preventDefault: vi.fn() } as unknown as PointerEvent);

			const seek = vi.fn();
			const scrubEnd = vi.fn();
			component.seek.subscribe(seek);
			component.scrubEnd.subscribe(scrubEnd);

			component.onPointerUp({ clientX: 60, pointerId: 3 } as PointerEvent);

			expect(component.isScrubbing()).toBe(false);
			expect(seek).toHaveBeenCalledWith(60);
			expect(scrubEnd).toHaveBeenCalledWith(60);
			expect((track as any).releasePointerCapture).toHaveBeenCalledWith(3);
		});

		it('does nothing on pointer up when not scrubbing', () => {
			const component = create({ duration: 100 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onPointerUp({ clientX: 60, pointerId: 3 } as PointerEvent);
			expect(seek).not.toHaveBeenCalled();
		});

		it('clears the hover ratio on pointer leave', () => {
			const track = makeTrack({ left: 0, width: 100 });
			const component = create({ duration: 100 }, track);
			component.onPointerMove({ clientX: 20 } as PointerEvent);
			expect(component.tooltipVisible()).toBe(true);

			component.onPointerLeave();
			expect(component.tooltipVisible()).toBe(false);
		});
	});

	describe('onKeydown', () => {
		function keyEvent(key: string) {
			return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
		}

		it('does nothing when disabled', () => {
			const component = create({ currentTime: 10, duration: 100, disabled: true });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('ArrowRight'));
			expect(seek).not.toHaveBeenCalled();
		});

		it('steps forward on ArrowRight/ArrowUp and clamps to duration', () => {
			const component = create({ currentTime: 98, duration: 100, keyboardStepSeconds: 5 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			const event = keyEvent('ArrowRight');
			component.onKeydown(event);
			expect(seek).toHaveBeenCalledWith(100);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it('steps backward on ArrowLeft/ArrowDown and clamps to zero', () => {
			const component = create({ currentTime: 2, duration: 100, keyboardStepSeconds: 5 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('ArrowLeft'));
			expect(seek).toHaveBeenCalledWith(0);
		});

		it('pages forward on PageUp', () => {
			const component = create({ currentTime: 10, duration: 100, keyboardPageSeconds: 10 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('PageUp'));
			expect(seek).toHaveBeenCalledWith(20);
		});

		it('pages backward on PageDown', () => {
			const component = create({ currentTime: 10, duration: 100, keyboardPageSeconds: 10 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('PageDown'));
			expect(seek).toHaveBeenCalledWith(0);
		});

		it('jumps to the start on Home', () => {
			const component = create({ currentTime: 50, duration: 100 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('Home'));
			expect(seek).toHaveBeenCalledWith(0);
		});

		it('jumps to the end on End', () => {
			const component = create({ currentTime: 50, duration: 100 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			component.onKeydown(keyEvent('End'));
			expect(seek).toHaveBeenCalledWith(100);
		});

		it('ignores unrecognized keys without emitting or preventing default', () => {
			const component = create({ currentTime: 50, duration: 100 });
			const seek = vi.fn();
			component.seek.subscribe(seek);
			const event = keyEvent('a');
			component.onKeydown(event);
			expect(seek).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});
	});
});
