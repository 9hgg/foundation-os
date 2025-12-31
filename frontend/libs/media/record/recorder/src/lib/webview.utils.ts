/**
 * Test if in webview and for browser.
 */
const rules = [
	// if it says it's a webview, let's go with that
	'WebView',
	// iOS webview will be the same as safari but missing "Safari"
	'(iPhone|iPod|iPad)(?!.*Safari)',
	// Android Lollipop and Above: webview will be the same as native but it will contain "wv"
	// Android KitKat to lollipop webview will put {version}.0.0.0
	'Android.*(wv|.0.0.0)',
	// old chrome android webview agent
	'Linux; U; Android',
];
const webviewRegExp = new RegExp('(' + rules.join('|') + ')', 'ig');
export function isWebview(ua: string) {
	return !!ua.match(webviewRegExp);
}
