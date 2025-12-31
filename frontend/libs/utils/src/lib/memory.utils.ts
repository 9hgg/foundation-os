/**
 * @author mrdoob / http://mrdoob.com/
 * @author jetienne / http://jetienne.com/
 * @author paulirish / http://paulirish.com/
 */

function getCurrentMemory(): number {
	const performance = window.performance as any;
	// check memory API support
	if (performance && performance.memory) {
		return performance.memory.usedJSHeapSize;
	}

	return -1;
}

export function MemoryStats() {
	let msMin = 100;
	let msMax = 0;
	const GRAPH_HEIGHT = 30;
	let redrawMBThreshold = GRAPH_HEIGHT;

	let lastFewValues: number[] = [];

	const htmlDivContainer = document.createElement('div');
	htmlDivContainer.id = 'stats';
	htmlDivContainer.style.cssText = 'width:100px;height:48px;opacity:0.9;cursor:pointer;overflow:hidden;z-index:10000;will-change:transform;';

	const htmlDivMS = document.createElement('div');
	htmlDivMS.id = 'ms';
	htmlDivMS.style.cssText = 'padding:0 0 3px 3px;text-align:left;background-color:#020;';
	htmlDivContainer.appendChild(htmlDivMS);

	const htmlDivMSText = document.createElement('div');
	htmlDivMSText.id = 'msText';
	htmlDivMSText.style.cssText = 'color:#0f0;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
	htmlDivMSText.innerHTML = 'Memory';
	htmlDivMS.appendChild(htmlDivMSText);

	const htmlDivGraphContainer = document.createElement('div');
	htmlDivGraphContainer.id = 'msGraph';
	htmlDivGraphContainer.style.cssText = 'position:relative;width:74px;height:' + GRAPH_HEIGHT + 'px;background-color:#0f0';
	htmlDivMS.appendChild(htmlDivGraphContainer);

	while (htmlDivGraphContainer.children.length < 74) {
		const bar = document.createElement('span');
		bar.style.cssText = 'width:1px;height:' + GRAPH_HEIGHT + 'px;float:left;background-color:#131';
		htmlDivGraphContainer.appendChild(bar);
	}

	const updateGraph = function (_htmlDivGraphContainer: HTMLDivElement, height: string | number, color: string) {
		const firstChild = _htmlDivGraphContainer.firstChild;
		if (!firstChild) return;
		const child = _htmlDivGraphContainer.appendChild(firstChild) as HTMLSpanElement;
		child.style.height = height + 'px';
		if (color) child.style.backgroundColor = color;
	};

	const redrawGraph = function (htmlDivGraphContainer: HTMLDivElement, oHFactor: number, hFactor: number) {
		[].forEach.call(htmlDivGraphContainer.children, function (c: HTMLSpanElement) {
			const cHeight = c.style.height.substring(0, c.style.height.length - 2);
			const cHeightNumber = Number(cHeight);

			// Convert to MB, change factor
			const newVal = GRAPH_HEIGHT - ((GRAPH_HEIGHT - cHeightNumber) / oHFactor) * hFactor;

			c.style.height = newVal + 'px';
		});
	};

	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	let precision;
	let i;
	function bytesToSize(bytes: number, nFractDigit: number) {
		if (bytes === 0) return 'n/a';
		nFractDigit = nFractDigit !== undefined ? nFractDigit : 0;
		precision = Math.pow(10, nFractDigit);
		i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round((bytes * precision) / Math.pow(1024, i)) / precision + ' ' + sizes[i];
	}

	// TODO, add a sanity check to see if values are bucketed.
	// If so, remind user to adopt the --enable-precise-memory-info flag.
	// open -a "/Applications/Google Chrome.app" --args --enable-precise-memory-info

	let lastTime = Date.now();
	let lastUsedHeap = getCurrentMemory();
	let delta = 0;
	let color = '#131';
	let ms = 0;
	let mbValue = 0;
	let factor = 0;
	let newThreshold = 0;

	return {
		domElement: htmlDivContainer,

		update: function () {
			// update at 30fps
			if (Date.now() - lastTime < 1000 / 30) return;
			lastTime = Date.now();

			const currentMemory = getCurrentMemory();
			lastFewValues.push(currentMemory);
			if (lastFewValues.length > 100) {
				lastFewValues.shift();
			}

			delta = currentMemory - lastUsedHeap;
			lastUsedHeap = currentMemory;

			// if memory has gone down, consider it a GC and draw a red bar.
			color = delta < 0 ? '#830' : '#131';

			const msSmooth = lastFewValues.reduce((a, b) => a + b, 0) / lastFewValues.length;
			ms = lastUsedHeap;
			msMin = Math.min(msMin, ms);
			msMax = Math.max(msMax, ms);
			htmlDivMSText.textContent = 'Mem: ' + bytesToSize(msSmooth, 2);

			mbValue = ms / (1024 * 1024);

			if (mbValue > redrawMBThreshold) {
				factor = (mbValue - (mbValue % GRAPH_HEIGHT)) / GRAPH_HEIGHT;
				newThreshold = GRAPH_HEIGHT * (factor + 1);
				redrawGraph(htmlDivGraphContainer, GRAPH_HEIGHT / redrawMBThreshold, GRAPH_HEIGHT / newThreshold);
				redrawMBThreshold = newThreshold;
			}

			updateGraph(htmlDivGraphContainer, GRAPH_HEIGHT - mbValue * (GRAPH_HEIGHT / redrawMBThreshold), color);
		},
	};
}
