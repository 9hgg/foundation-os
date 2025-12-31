import { Injectable } from '@angular/core';
import { jwtHelper } from './jwt.utils';

const TEST_COOKIE_NAME = 'k';
const TEST_COOKIE_VALUE = 'v';

@Injectable({ providedIn: 'root' })
export class CookiesService {
	constructor() {
		// Set the interval for cookie clearing detection
		this.setCookie(TEST_COOKIE_NAME, TEST_COOKIE_VALUE, 1);
		const checkInterval = 1000; // Check every 1 s
		setInterval(
			() =>
				this.detectCookieClearing(undefined, () => {
					console.log('Cookies were cleared.');
				}),
			checkInterval
		);
	}

	/**
	 * Get a cookie by name
	 * @param name
	 */
	getCookie(name: string) {
		const value = '; ' + document.cookie;
		const parts = value.split('; ' + name + '=');
		if (parts.length === 2) {
			return parts.pop()?.split(';').shift();
		}
		return undefined;
	}

	/**
	 * Set a cookie
	 * @param name
	 * @param value
	 * @param days
	 */
	setCookie(name: string, value: string, days: number) {
		let expires = '';
		if (days) {
			const date = new Date();
			date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
			expires = '; expires=' + date.toUTCString();
		}
		document.cookie = name + '=' + (value || '') + expires + '; path=/';
	}

	/**
	 * Delete a cookie
	 * @param name
	 */
	deleteCookie(name: string) {
		const date = new Date();
		date.setTime(date.getTime() - 1);
		const expires = '; expires=' + date.toUTCString();
		document.cookie = name + '=' + expires + '; path=/';
	}

	getAllCookies() {
		const cookies: {
			[key: string]: {
				rawValue: string;
				extra: any;
			};
		} = {};
		document.cookie.split(';').forEach((cookie) => {
			const [key, value] = cookie.split('=');
			cookies[key.trim()] = { rawValue: value, extra: {} };

			try {
				cookies[key.trim()].extra = JSON.parse(value);
			} catch (e) {}

			// Bearer abc
			try {
				if (value.startsWith('Bearer ')) {
					const decoded = jwtHelper.decodeToken(value.replace('Bearer', '').trim());
					cookies[key.trim()].extra = { bearer: decoded };
				}
			} catch (e) {}

			// decodable
			try {
				const decoded = jwtHelper.decodeToken(value);
				cookies[key.trim()].extra = { decoded };
			} catch (e) {}
		});

		return cookies;
	}

	detectCookieClearing(
		cookiePresentCallback: (() => void) | undefined = undefined,
		cookieClearedCallback: () => void = () => {
			console.log('Cookies have been cleared.');
		}
	) {
		if (!this.getCookie(TEST_COOKIE_NAME)) {
			cookieClearedCallback();
			this.setCookie(TEST_COOKIE_NAME, TEST_COOKIE_VALUE, 1); // Reset the test cookie
			// Perform some action here
		} else {
			cookiePresentCallback?.();
		}
	}
}
