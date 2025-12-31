import { Resource } from '@foundation/utils';
import { Delta } from 'quill';
export interface ArticleConfig {
	images?: {
		[imageRole: string]: {
			alt: string;
			entityFileId: string;
		};
	};
	/** delta is the unique quill state representation of the content (HTML) article */
	deltas?: Delta | null;
	/** Indicates whether comments are enabled for the article */
	commentsEnabled?: boolean;
}

export interface Article extends Resource {
	title?: string;
	kind: 'default' | 'support' | 'backlog';
	slug?: string;
	featured: boolean;
	summary?: string;
	content?: string;
	authorId?: string;
	draft: boolean;
	timePublished?: Date;
	tags: string[];
	config: ArticleConfig;
}
