import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

interface GoogleFont {
	family: string;
	// ... other properties from the Google Fonts API
}

const DEFAULT_FONTS: GoogleFont[] = [
	{ family: 'Roboto' },
	{ family: 'Open Sans' },
	{ family: 'Lato' },
	{ family: 'Montserrat' },
	{ family: 'Source Sans Pro' },
	{ family: 'Oswald' },
	{ family: 'Raleway' },
	{ family: 'Poppins' },
	{ family: 'Merriweather' },
	{ family: 'Noto Sans' },
	{ family: 'Ubuntu' },
	{ family: 'Playfair Display' },
	{ family: 'Roboto Condensed' },
	{ family: 'Nunito' },
	{ family: 'Rubik' },
	{ family: 'Inter' },
	{ family: 'Heebo' },
	{ family: 'PT Sans' },
	{ family: 'Fira Sans' },
	{ family: 'Dancing Script' },
	{ family: 'Pacifico' },
	{ family: 'Bitter' },
	{ family: 'Arimo' },
	{ family: 'Inconsolata' },
	{ family: 'Cabin' },
	{ family: 'Libre Baskerville' },
	{ family: 'Josefin Sans' },
	{ family: 'Anton' },
	{ family: 'Hind' },
	{ family: 'Quicksand' },
	{ family: 'Mukta' },
	{ family: 'Exo 2' },
	{ family: 'Rokkitt' },
	{ family: 'Amatic SC' },
	{ family: 'Lora' },
	{ family: 'Karla' },
	{ family: 'Varela Round' },
	{ family: 'Barlow' },
	{ family: 'IBM Plex Sans' },
	{ family: 'Zilla Slab' },
	{ family: 'Work Sans' },
	{ family: 'Crimson Pro' },
	{ family: 'Manrope' },
	{ family: 'Caveat' },
	{ family: 'Teko' },
	{ family: 'Abel' },
	{ family: 'Questrial' },
	{ family: 'Sigmar One' },
	{ family: 'Overpass' },
	{ family: 'Asap' },
	{ family: 'PT Serif' },
	{ family: 'Nanum Gothic' },
	{ family: 'Lobster' },
	{ family: 'Maven Pro' },
	{ family: 'Bebas Neue' },
	{ family: 'Domine' },
	{ family: 'Spectral' },
	{ family: 'Cormorant Garamond' },
	{ family: 'Crimson Text' },
	{ family: 'Chivo' },
	{ family: 'Cinzel' },
	{ family: 'Fjalla One' },
	{ family: 'Oxygen' },
	{ family: 'Permanent Marker' },
	{ family: 'Ubuntu Mono' },
	{ family: 'Slabo 27px' },
	{ family: 'Archivo' },
	{ family: 'Space Mono' },
	{ family: 'Yanone Kaffeesatz' },
	{ family: 'Passion One' },
	{ family: 'Muli' },
	{ family: 'Martel' },
	{ family: 'Saira' },
	{ family: 'Volkhov' },
	{ family: 'Alegreya' },
	{ family: 'Roboto Slab' },
	{ family: 'Arvo' },
	{ family: 'Titillium Web' },
	{ family: 'Rajdhani' },
	{ family: 'DM Serif Display' },
	{ family: 'Catamaran' },
	{ family: 'Cairo' },
	{ family: 'Frank Ruhl Libre' },
	{ family: 'Prompt' },
	{ family: 'Archivo Narrow' },
	{ family: 'Pattaya' },
	{ family: 'Lobster Two' },
	{ family: 'Bowlby One' },
	{ family: 'Aleo' },
	{ family: 'Sarala' },
	{ family: 'Righteous' },
	{ family: 'Baloo 2' },
	{ family: 'Grandstander' },
	{ family: 'Sarabun' },
	{ family: 'Chakra Petch' },
	{ family: 'Ruda' },
	{ family: 'Abril Fatface' },
	{ family: 'Alfa Slab One' },
];

// interface GoogleFontsApiResponse {
// 	items: GoogleFont[];
// }

@Injectable({ providedIn: 'root' })
export class GoogleFontService {
	private fontsCache$: Observable<GoogleFont[]> | null = null;
	private _alreadyAddedFonts: string[] = [];

	constructor(private http: HttpClient) {}

	getFonts(): Observable<GoogleFont[]> {
		if (!this.fontsCache$) {
			// this.fontsCache$ = this.http
			// 	.get<GoogleFontsApiResponse>('https://www.googleapis.com/webfonts/v1/webfonts?key=YOUR_API_KEY')
			// 	.pipe(
			// 		map((response) => response.items || []),
			// 		shareReplay(1)
			// 	);
			this.fontsCache$ = of(DEFAULT_FONTS).pipe(shareReplay(1));
		}
		return this.fontsCache$;
	}

	addFontToHtml(font: string) {
		if (this._alreadyAddedFonts.includes(font)) {
			return;
		}
		const link = document.createElement('link');
		link.href = `https://fonts.googleapis.com/css?family=${font.replace(/ /g, '+')}`;
		link.rel = 'stylesheet';
		document.head.appendChild(link);
		this._alreadyAddedFonts.push(font);
	}
}
