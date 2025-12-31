import { Resource } from '@foundation/utils';

export interface Translation extends Resource {
	hash: string;
	sourceContent: string;
	languageSource: string | null;
	languageTarget: string;
	translatedContent: string | null;
	translator: string | null;
	version: string | null;
	translationContext: string | null;
}
