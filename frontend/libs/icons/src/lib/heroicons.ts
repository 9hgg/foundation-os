/* eslint-disable @angular-eslint/component-selector */
import { Component } from '@angular/core';

/**
 * cross icon (to close a menu for example)
 */
@Component({
	selector: 'tw-cross',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>',
})
export class TwCrossIcon {}

/**
 * User icon
 */
@Component({
	selector: 'tw-user',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>',
})
export class TwUserIcon {}

/**
 * Upload icon with multiple files
 */
@Component({
	selector: 'tw-multi-upload',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" /></svg>',
})
export class TwUploadMultiIcon {}

/**
 * Upload icon
 */
@Component({
	selector: 'tw-upload',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" /></svg>',
})
export class TwUploadIcon {}

/**
 * Info circle icon
 */
@Component({
	selector: 'tw-info-circle',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>',
})
export class TwInfoCircleIcon {}

/**
 * Search document icon
 */
@Component({
	selector: 'tw-search-document',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>',
})
export class TwSearchDocumentIcon {}

/**
 * Microphone icon
 */
@Component({
	selector: 'tw-mic',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>',
})
export class TwMicIcon {}

/**
 * Microphone icon OFF
 */
@Component({
	selector: 'tw-mic-off',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" viewBox="0 -960 960 960" ><path d="m710-362-58-58q14-23 21-48t7-52h80q0 44-13 83.5T710-362ZM480-594Zm112 112-72-72v-206q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v126l-80-80v-46q0-50 35-85t85-35q50 0 85 35t35 85v240q0 11-2.5 20t-5.5 18ZM440-120v-123q-104-14-172-93t-68-184h80q0 83 57.5 141.5T480-320q34 0 64.5-10.5T600-360l57 57q-29 23-63.5 39T520-243v123h-80Zm352 64L56-792l56-56 736 736-56 56Z"/></svg>',
})
export class TwMicOffIcon {}

/**
 * Cog/Settings icon
 */
@Component({
	selector: 'tw-cog',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>',
})
export class TwCogIcon {}

/**
 * Camera icon
 */
@Component({
	selector: 'tw-cam',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>',
})
export class TwCamIcon {}

/**
 * Camera icon OFF
 */
@Component({
	selector: 'tw-cam-off',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" viewBox="0 -960 960 960" ><path d="M880-260 720-420v67l-80-80v-287H353l-80-80h367q33 0 56.5 23.5T720-720v180l160-160v440ZM822-26 26-822l56-56L878-82l-56 56ZM498-575ZM382-464ZM160-800l80 80h-80v480h480v-80l80 80q0 33-23.5 56.5T640-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Z"/></svg>',
})
export class TwCamOffIcon {}

/**
 * Screen capture icon
 */
@Component({
	selector: 'tw-screen-capture',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 512 437.24" stroke-width="27" stroke="currentColor" ><path d="M16.03 0h479.94C504.8 0 512 7.2 512 16.03v317.62c0 8.83-7.2 16.03-16.03 16.03H16.03C7.2 349.68 0 342.48 0 333.65V16.03C0 7.2 7.2 0 16.03 0zm279.34 72.67c18.8 0 34.03 15.25 34.03 34.02 0 18.81-15.23 34.03-34.03 34.03-8 0-15.71-2.82-21.8-7.89l-45.19 18.83c.14 1.28.23 2.57.25 3.87l46.98 21.65a33.98 33.98 0 0 1 19.59-6.24c18.66 0 33.87 15.17 33.87 33.89 0 18.71-15.21 33.87-33.87 33.87-18.73 0-33.89-15.16-33.89-33.87 0-2.58.29-5.17.89-7.72l-41.76-19.23a34.06 34.06 0 0 1-25.87 11.94c-18.76 0-34.01-15.25-34.01-34.04 0-18.78 15.25-34.01 34.01-34.01 8.45 0 16.59 3.13 22.83 8.76l44.35-18.5c-.27-1.76-.4-3.54-.4-5.34 0-18.77 15.21-34.02 34.02-34.02zm29.03 299.14c.39 25.16 10.76 47.72 38.84 65.43H140.12c22.61-16.38 38.93-36.18 38.84-65.43H324.4zM35.19 22.9h441.67c7.83 0 14.16 6.38 14.16 14.16v237.26c0 7.78-6.38 14.16-14.16 14.16H35.19c-7.78 0-14.16-6.38-14.16-14.16V37.06c-.05-7.82 6.37-14.16 14.16-14.16z"/></svg>',
})
export class TwScreenCaptureIcon {}

/**
 * Article icon
 */
@Component({
	selector: 'tw-article',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg class="h-full w-full fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 6H7V5h11zm0 2H7v1h11zm0 3H7v1h11zm-4 4h4v-1h-4zm0 3h3v-1h-3zm-2 2H7v-6h5zm-1-5H8v4h3zm10 8H4V2h17zM20 3H5v19h15z"/><path fill="none" d="M0 0h24v24H0z"/></svg>',
})
export class TwArticleIcon {}

/**
 * Document icon
 */
@Component({
	selector: 'tw-document',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',
})
export class TwDocumentIcon {}

/**
 * Download icon
 */
@Component({
	selector: 'tw-download',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" /></svg>',
})
export class TwDownloadIcon {}

/**
 * more vertical icon
 */
@Component({
	selector: 'tw-more-vertical',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>',
})
export class TwMoreVerticalIcon {}

/**
 * trash icon
 */
@Component({
	selector: 'tw-trash',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>',
})
export class TwTrashIcon {}

/**
 * pencil icon
 */
@Component({
	selector: 'tw-pencil',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>',
})
export class TwPencilIcon {}

/**
 * tag icon
 */
@Component({
	selector: 'tw-tag',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" /></svg>',
})
export class TwTagIcon {}

/**
 * archive icon
 */
@Component({
	selector: 'tw-archive',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM6.24 5h11.52l.81.97H5.44l.8-.97zM5 19V8h14v11H5zm8.45-9h-2.9v3H8l4 4 4-4h-2.55z"/></svg>',
})
export class TwArchiveIcon {}

/**
 * add icon
 */
@Component({
	selector: 'tw-add',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>',
})
export class TwAddIcon {}

/**
 * checkbox icon EMPTY
 */
@Component({
	selector: 'tw-checkbox-empty',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" viewBox="0 0 24 24"  fill="currentColor" stroke="currentColor"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>',
})
export class TwCheckboxEmptyIcon {}

/**
 * checkbox icon CHECKED
 */
@Component({
	selector: 'tw-checkbox-checked',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
})
export class TwCheckboxCheckedIcon {}

/**
 * checkbox icon INDETERMINATE
 */
@Component({
	selector: 'tw-checkbox-indeterminate',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: "<svg xmlns='http://www.w3.org/2000/svg' enable-background='new 0 0 24 24' viewBox='0 0 24 24' fill='currentColor' stroke='currentColor'><g><g><g><path d='M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M17,13H7v-2h10V13z'/></g></g></g></svg>",
})
export class TwCheckboxIndeterminateIcon {}

/**
 * enabled icon CHECKED
 */
@Component({
	selector: 'tw-enabled-checked',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor"><path d="M18 7H6a5 5 0 0 0 0 10h12a5 5 0 0 0 0-10zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3z" /></svg>',
})
export class TwEnabledCheckedIcon {}

/**
 * enabled icon EMPTY
 */
@Component({
	selector: 'tw-enabled-empty',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor"><path d="M18 7H6a5 5 0 0 0 0 10h12a5 5 0 0 0 0-10zm0 9H6a4 4 0 0 1 0-8h12a4 4 0 0 1 0 8zM6 9a3 3 0 1 0 3 3 3 3 0 0 0-3-3zm0 5a2 2 0 1 1 2-2 2.003 2.003 0 0 1-2 2z" /></svg>',
})
export class TwEnabledEmptyIcon {}

/**
 * chevron down icon
 */
@Component({
	selector: 'tw-chevron-down',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>',
})
export class TwChevronDownIcon {}

/**
 * chevron up icon
 */
@Component({
	selector: 'tw-chevron-up',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>',
})
export class TwChevronUpIcon {}

/**
 * image icon
 */
@Component({
	selector: 'tw-image',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>',
})
export class TwImageIcon {}

/**
 * input icon
 */
@Component({
	selector: 'tw-input',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M180-12q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h405l-60 60H180v600h600v-348l60-60v408q0 24-18 42t-42 18H180Zm300-360Zm182-352 43 42-285 284v86h85l286-286 42 42-303 304H360v-170l302-302Zm171 168L662-724l100-100q17-17 42.311-17T847-823l84 85q17 18 17 42.472T930-654l-97 98Z"/></svg>',
})
export class TwInputIcon {}

/**
 * button icon
 */
@Component({
	selector: 'tw-button',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M180-280q-24 0-42-18t-18-42v-280q0-24 18-42t42-18h600q24 0 42 18t18 42v280q0 24-18 42t-42 18H180Zm0-60h600v-280H180v280Zm0 0v-280 280Z"/></svg>',
})
export class TwButtonIcon {}

/**
 * cancel icon
 */
@Component({
	selector: 'tw-cancel',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" class="fill-current" height="24" viewBox="0 -960 960 960" width="24"><path d="m336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
})
export class TwCancelIcon {}

/**
 * arrow drop down icon
 */
@Component({
	selector: 'tw-arrow-drop-down',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="fill-current" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-360 280-560h400L480-360Z"/></svg>',
})
export class TwArrowDropDownIcon {}

/**
 * arrow to top left icon
 */
@Component({
	selector: 'tw-arrow-top-left',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 19.5l-15-15m0 0v11.25m0-11.25h11.25" /></svg>',
})
export class TwArrowTopLeftIcon {}

/**
 * stop icon
 */
@Component({
	selector: 'tw-stop',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="fill-current" height="24" viewBox="0 -960 960 960" width="24"><path d="M240-240v-480h480v480H240Z"/></svg>',
})
export class TwStopIcon {}

/**
 * delete icon
 */
@Component({
	selector: 'tw-delete',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" height="24" width="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>',
})
export class TwDeleteIcon {}

/**
 * lock open icon
 */
@Component({
	selector: 'tw-lock-open',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full fill-current" width="24px" height="24px" viewBox="0 0 24 24"><path d="M1.5 10A1.504 1.504 0 0 0 0 11.5v10A1.504 1.504 0 0 0 1.5 23h15a1.504 1.504 0 0 0 1.5-1.5v-10a1.504 1.504 0 0 0-1.5-1.5H15V6.5c0-2.04 1.346-3.7 3-3.7 1.71 0 3 1.59 3 3.7V8h3V6.5A6.272 6.272 0 0 0 18 0a6.272 6.272 0 0 0-6 6.5V10zM13 6.5A5.274 5.274 0 0 1 18 1a5.274 5.274 0 0 1 5 5.5V7h-1v-.5c0-2.68-1.72-4.7-4-4.7-2.206 0-4 2.108-4 4.7V10h-1zm2 4.5h1.5a.506.506 0 0 1 .5.5v10a.506.506 0 0 1-.5.5h-15a.506.506 0 0 1-.5-.5v-10a.506.506 0 0 1 .5-.5zm-6 9H8v-5h1v1h1v1H9v1h1v1H9zm1-5H9v-1h1z"/><path fill="none" d="M0 0h24v24H0z"/></svg>',
})
export class TwLockOpenIcon {}

/**
 * play icon
 */
@Component({
	selector: 'tw-play',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg role="img" aria-hidden="true" viewBox="0 0 16 16" class="h-full w-full fill-current"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"></path></svg>',
})
export class TwPlayIcon {}

/**
 * pause icon
 */
@Component({
	selector: 'tw-pause',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg role="img" aria-hidden="true" viewBox="0 0 16 16" class="h-full w-full fill-current"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"></path></svg>',
})
export class TwPauseIcon {}

/**
 * pause icon
 */
@Component({
	selector: 'tw-go-trough-door',
	standalone: true,
	styles: ':host{display:inline-block}',
	template: '<svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 24 24" class="h-full w-full fill-current"><path d="M19 1v22H5v-8h1v6.293l3-3V15h1v3.707L6.707 22H18V2h-8v8H9V2H6v8H5V1zm-6.354 13.646l.707.707 2.854-2.853-2.853-2.854-.707.707L14.293 12H2v1h12.293z"/><path fill="none" d="M0 0h24v24H0z"/></svg>',
})
export class TwGoTroughDoorIcon {}

/**
 * background color icon
 */
@Component({
	selector: 'tw-background-color',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: 'not done',
})
export class TwBackgroundColorIcon {}
/**
 * text color icon
 * */
@Component({
	selector: 'tw-text-color',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: 'not done',
})
export class TwTextColorIcon {}

/**
 * palette icon
 * */
@Component({
	selector: 'tw-palette',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="w-full h-full"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M21.73 10.456l.685-.742A2.454 2.454 0 0 1 23 11.433c0 2.744-3.938 5.032-7.947 5.941l1.396-1.434c3.007-1.002 5.55-2.746 5.55-4.507a1.595 1.595 0 0 0-.268-.977zm-19.53.25c0-3.745 5.101-6.434 9.664-6.505h.16c2.01 0 2.323.337 2.539.57a1.266 1.266 0 0 1 .331.918 2.856 2.856 0 0 1-.142.824 3.555 3.555 0 0 0-.17.991 1.863 1.863 0 0 0 1.632 1.882l.862-.84c-.873-.102-1.494-.342-1.494-1.042 0-.548.312-.997.312-1.815a2.27 2.27 0 0 0-.606-1.607c-.345-.372-.817-.88-3.264-.88h-.16C6.828 3.28 1.2 6.237 1.2 10.704c0 3.164 2.758 5.244 5.785 6.292a3.098 3.098 0 0 1 1.147-.683c-3.038-.84-5.932-2.76-5.932-5.609zM12 7.5A1.5 1.5 0 1 1 10.5 6 1.5 1.5 0 0 1 12 7.5zm-1 0a.5.5 0 1 0-.5.5.5.5 0 0 0 .5-.5zM6.5 11A1.5 1.5 0 1 1 8 9.5 1.5 1.5 0 0 1 6.5 11zM7 9.5a.5.5 0 1 0-.5.5.5.5 0 0 0 .5-.5zm3 4A1.5 1.5 0 1 1 8.5 12a1.5 1.5 0 0 1 1.5 1.5zm-1 0a.5.5 0 1 0-.5.5.5.5 0 0 0 .5-.5zm13.11-7.483L18.4 9.35l-7.45 7.25 1.4 1.4 7.25-7.449 3.383-3.661a.626.626 0 0 0-.873-.873zM9.368 17.619l1.439 1.738a2.94 2.94 0 0 1-1.63 2.234 3.92 3.92 0 0 1-1.626.359 3.598 3.598 0 0 1-1.733-.427s1.8-.968 1.809-2.464c.006-1.38 1.451-1.44 1.703-1.44zm.35 1.99l-.78-.94a.379.379 0 0 0-.311.395 3.191 3.191 0 0 1-.633 1.85 3.042 3.042 0 0 0 .772-.234 1.823 1.823 0 0 0 .952-1.07z"></path><path fill="none" d="M0 0h24v24H0z"></path></g></svg>',
})
export class TwPaletteIcon {}

/**
 * Paint choice icon
 */
@Component({
	selector: 'tw-paint-choice',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>',
})
export class TwPaintChoiceIcon {}

@Component({
	selector: 'tw-scissors',
	styles: ':host{display:inline-block}',
	standalone: true,
	template:
		'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="w-full h-full"><path d="M11.7 9.989l-.896-.766L12.153.246 14 2.093v9.861l-1-.854V2.507l-.153-.153zm2.536 3.482l1.523 1.302a2.806 2.806 0 0 1 1.325-.688 4.34 4.34 0 0 1 4.555 2.08 2.473 2.473 0 0 1-1.722 3.75 3.746 3.746 0 0 1-.806.087 4.368 4.368 0 0 1-3.75-2.166 2.59 2.59 0 0 1-.18-2.242l-1.654-1.414L12 15.707v1.508a3.5 3.5 0 0 1 2 3.285 3.283 3.283 0 0 1-3 3.5 3.283 3.283 0 0 1-3-3.5 3.283 3.283 0 0 1 3-3.5v-1.293l-9-9V3.015zM11 18a2.295 2.295 0 0 0-2 2.5 2.295 2.295 0 0 0 2 2.5 2.295 2.295 0 0 0 2-2.5 2.295 2.295 0 0 0-2-2.5zm1.764-4.471L3 5.185v1.108l8.5 8.5zm3.477 3.832a3.384 3.384 0 0 0 3.459 1.577 1.48 1.48 0 0 0 1.06-2.3 3.391 3.391 0 0 0-3.46-1.576 1.48 1.48 0 0 0-1.06 2.3z" fill="currentColor"/></svg>',
})
export class TwScissorsIcon {}

/**
 * chevron left icon (previous)
 */
@Component({
	selector: 'tw-chevron-left',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>',
})
export class TwChevronLeftIcon {}

/**
 * chevron right icon (next)
 */
@Component({
	selector: 'tw-chevron-right',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>',
})
export class TwChevronRightIcon {}

/**
 * double chevron left icon (go to beginning)
 */
@Component({
	selector: 'tw-chevron-double-left',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>',
})
export class TwChevronDoubleLeftIcon {}

/**
 * restart/refresh icon
 */
@Component({
	selector: 'tw-restart',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>',
})
export class TwRestartIcon {}

/**
 * navigation/compass icon
 */
@Component({
	selector: 'tw-navigation',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>',
})
export class TwNavigationIcon {}

/**
 * cursor text icon for text input (I-beam cursor)
 */
@Component({
	selector: 'tw-cursor-text',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M8 3h8v2h-3v14h3v2H8v-2h3V5H8V3z"/></svg>',
})
export class TwCursorTextIcon {}

/**
 * help (question mark) icon
 */
@Component({
	selector: 'tw-help',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>',
})
export class TwHelpIcon {}

// eye icon
/**
 * eye icon
 */
@Component({
	selector: 'tw-eye',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5C6.75 4.5 2.25 9 2.25 12s4.5 7.5 9.75 7.5 9.75-4.5 9.75-7.5S17.25 4.5 12 4.5zM12 15a3 3 0 100-6 3 3 0 000 6z" /></svg>',
})
export class TwEyeIcon {}

/**
 * fit horizontally icon
 */
@Component({
	selector: 'tw-fit-horizontal',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		xmlns="http://www.w3.org/2000/svg"
		xmlns:xlink="http://www.w3.org/1999/xlink"
		viewBox="0 0 64 64"
		enable-background="new 0 0 64 64"
		class="h-full w-full fill-current"
		xml:space="preserve"
	>
		<polyline
			fill="none"
			stroke="#000000"
			stroke-width="2"
			stroke-linejoin="bevel"
			stroke-miterlimit="10"
			points="16,25 9,32 16,39 
	"
		/>
		<polyline
			fill="none"
			stroke="#000000"
			stroke-width="2"
			stroke-linejoin="bevel"
			stroke-miterlimit="10"
			points="48,39 55,32 
	48,25 "
		/>
		<polyline
			fill="none"
			stroke="#000000"
			stroke-width="2"
			stroke-miterlimit="10"
			points="55,32 43,32 9,32 "
		/>
		<line
			fill="none"
			stroke="#000000"
			stroke-width="2"
			stroke-miterlimit="10"
			x1="63"
			y1="0"
			x2="63"
			y2="64"
		/>
		<line
			fill="none"
			stroke="#000000"
			stroke-width="2"
			stroke-miterlimit="10"
			x1="1"
			y1="0"
			x2="1"
			y2="64"
		/>
	</svg>`,
})
export class TwFitHorizontalIcon {}

/**
 * 1:1 aspect ratio icon
 */
@Component({
	selector: 'tw-aspect-ratio-1-1',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		viewBox="0 0 24 24"
		class="h-full w-full fill-current"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M5.938 7.946L9 6.773V17H8V8.227l-1.704.653zM21 21h-5v1h6v-6h-1zM3 16H2v6h6v-1H3zM3 3h5V2H2v6h1zm13-1v1h5v5h1V2zm-3.5 7.75a.75.75 0 1 0 .75.75.75.75 0 0 0-.75-.75zm0 5a.75.75 0 1 0 .75.75.75.75 0 0 0-.75-.75zM16 17h1V6.773l-3.062 1.173.358.934L16 8.227z" />
		<path
			fill="none"
			d="M0 0h24v24H0z"
		/>
	</svg>`,
})
export class TwAspectRatio1_1Icon {}

/**
 * team icon
 */
@Component({
	selector: 'tw-team',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		class="h-full w-full fill-current"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M7.5 9A3.5 3.5 0 1 0 4 5.5 3.504 3.504 0 0 0 7.5 9zm0-6A2.5 2.5 0 1 1 5 5.5 2.503 2.503 0 0 1 7.5 3zm2.713 14a5.456 5.456 0 0 0-.188 1H2v-3.5A4.505 4.505 0 0 1 6.5 10h2a4.503 4.503 0 0 1 4.414 3.649 5.518 5.518 0 0 0-.936.632A3.495 3.495 0 0 0 8.5 11h-2A3.504 3.504 0 0 0 3 14.5V17zm6.287-4A3.5 3.5 0 1 0 13 9.5a3.504 3.504 0 0 0 3.5 3.5zm0-6A2.5 2.5 0 1 1 14 9.5 2.503 2.503 0 0 1 16.5 7zM22 18.5a4.505 4.505 0 0 0-4.5-4.5h-2a4.505 4.505 0 0 0-4.5 4.5V22h11zM21 21h-9v-2.5a3.504 3.504 0 0 1 3.5-3.5h2a3.504 3.504 0 0 1 3.5 3.5z"
		/>
		<path
			fill="none"
			d="M0 0h24v24H0z"
		/>
	</svg>`,
})
export class TwTeamIcon {}

/**
 * team icon
 */
@Component({
	selector: 'tw-link',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		class="h-full w-full fill-current"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M7 14c0 .025.003.05.004.075l-3.54-3.54a5 5 0 0 1 7.072-7.07l4 4a4.992 4.992 0 0 1-1.713 8.187l-.237-.237a1.998 1.998 0 0 1-.413-.609 3.985 3.985 0 0 0 1.656-6.635l-4-4a4 4 0 0 0-5.369-.26l-.318-.387.318.386a4 4 0 0 0-.29 5.92l2.94 2.94A7.012 7.012 0 0 0 7 14zm16 4a4.97 4.97 0 0 0-1.464-3.536l-3.54-3.539c0 .025.004.05.004.075a7.087 7.087 0 0 1-.113 1.23l2.942 2.941a4 4 0 0 1-.128 5.78l.338.368-.338-.368a4 4 0 0 1-5.53-.122l-4-4a3.966 3.966 0 0 1 1.658-6.631 1.998 1.998 0 0 0-.415-.613l-.234-.234a5.004 5.004 0 0 0-1.907 1.315 5 5 0 0 0 .191 6.87l4 4A5 5 0 0 0 23 18z"
		/>
		<path
			fill="none"
			d="M0 0h24v24H0z"
		/>
	</svg>`,
})
export class TwLinkIcon {}

/** Credit card */
@Component({
	selector: 'tw-credit-card',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		class="h-full w-full fill-current"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M21.75 5H2.25A1.251 1.251 0 0 0 1 6.25v12.5A1.251 1.251 0 0 0 2.25 20h19.5A1.251 1.251 0 0 0 23 18.75V6.25A1.251 1.251 0 0 0 21.75 5zM22 18.75a.25.25 0 0 1-.25.25H2.25a.25.25 0 0 1-.25-.25V10h20zM22 8H2V6.25A.25.25 0 0 1 2.25 6h19.5a.25.25 0 0 1 .25.25zM8 18H3v-1h5zm13 0h-2v-1h2zm-3 0h-2v-1h2zm-6-2H3v-1h9z" />
		<path
			fill="none"
			d="M0 0h24v24H0z"
		/>
	</svg>`,
})
export class TwCreditCardIcon {}

/**
 * folder icon
 */
@Component({
	selector: 'tw-folder',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="h-full w-full"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
		/>
	</svg>`,
})
export class TwFolderIcon {}

/**
 * folder arrow icon
 */
@Component({
	selector: 'tw-folder-arrow',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: `<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		fill="currentColor"
		class="h-full w-full"
	>
		<path d="M2 19V8h20v7.466l1 1.01V4H12.2L11 2H4L2.8 4H1v16h9v-1zM2 5h1.366l1.2-2h5.868l1.2 2H22v2H2zm21.182 14.5l-3.828 3.853-.709-.706 2.647-2.665H12v-1h9.257l-2.611-2.63.709-.704z"></path>
		<path
			fill="none"
			d="M0 0h24v24H0z"
		></path>
	</svg>`,
})
export class TwFolderArrowIcon {}

/**
 * project icon
 */
@Component({
	selector: 'tw-project',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
})
export class TwProjectIcon {}

/**
 * file icon
 */
@Component({
	selector: 'tw-file',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>',
})
export class TwFileIcon {}

/**
 * dashboard icon
 */
@Component({
	selector: 'tw-dashboard',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>',
})
export class TwDashboardIcon {}

/**
 * search icon
 */
@Component({
	selector: 'tw-search',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>',
})
export class TwSearchIcon {}

/**
 * database icon
 */
@Component({
	selector: 'tw-database',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>',
})
export class TwDatabaseIcon {}

/**
 * code icon
 */
@Component({
	selector: 'tw-code',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>',
})
export class TwCodeIcon {}

/**
 * flow icon
 */
@Component({
	selector: 'tw-flow',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>',
})
export class TwFlowIcon {}

/**
 * support icon
 */
@Component({
	selector: 'tw-support',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>',
})
export class TwSupportIcon {}

/**
 * logout icon
 */
@Component({
	selector: 'tw-logout',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>',
})
export class TwLogoutIcon {}

/**
 * bars 3 icon (hamburger/drag handle)
 */
@Component({
	selector: 'tw-bars-3',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>',
})
export class TwBars3Icon {}

/**
 * Star icon
 */
@Component({
	selector: 'tw-star',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>',
})
export class TwStarIcon {}

/**
 * Heart icon
 */
@Component({
	selector: 'tw-heart',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>',
})
export class TwHeartIcon {}

/**
 * Check icon
 */
@Component({
	selector: 'tw-check',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>',
})
export class TwCheckIcon {}

/**
 * Check Circle icon
 */
@Component({
	selector: 'tw-check-circle',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
})
export class TwCheckCircleIcon {}

/**
 * Emoji Happy icon (used for Welcome)
 */
@Component({
	selector: 'tw-emoji-happy',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
})
export class TwEmojiHappyIcon {}

/**
 * List icon (used for Choice)
 */
@Component({
	selector: 'tw-list',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>',
})
export class TwListIcon {}

/**
 * Clipboard List icon (used for Text input in legacy)
 */
@Component({
	selector: 'tw-clipboard-list',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
})
export class TwClipboardListIcon {}

/**
 * Document Text icon
 */
@Component({
	selector: 'tw-document-text',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
})
export class TwDocumentTextIcon {}

/**
 * Photo icon
 */
@Component({
	selector: 'tw-photo',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>',
})
export class TwPhotoIcon {}

/**
 * Calendar icon
 */
@Component({
	selector: 'tw-calendar',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>',
})
export class TwCalendarIcon {}

/**
 * Shield Check icon
 */
@Component({
	selector: 'tw-shield-check',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>',
})
export class TwShieldCheckIcon {}

/**
 * Microphone icon
 */
@Component({
	selector: 'tw-microphone',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>',
})
export class TwMicrophoneIcon {}

/**
 * Video Camera icon
 */
@Component({
	selector: 'tw-video-camera',
	styles: ':host{display:inline-block}',
	standalone: true,
	template: '<svg xmlns="http://www.w3.org/2000/svg" class="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>',
})
export class TwVideoCameraIcon {}
