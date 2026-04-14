import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
	selector: 'lib-pdf-viewer',
	imports: [],
	templateUrl: './pdf-viewer.component.html',
	styleUrls: ['./pdf-viewer.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewerComponent {
	private readonly _sanitizer = inject(DomSanitizer);

	pdfUrl = input<string | null>(null);
	title = input<string>('PDF');
	containerClass = input<string | null>(null);

	safeUrl = computed<SafeResourceUrl | null>(() => {
		const url = this.pdfUrl();
		if (!url) return null;
		const hasFragment = url.includes('#');
		const viewFragment = ''; //'view=FitH&zoom=page-fit';
		const normalizedUrl = hasFragment ? url : `${url}#${viewFragment}`;
		return this._sanitizer.bypassSecurityTrustResourceUrl(normalizedUrl);
	});
}
