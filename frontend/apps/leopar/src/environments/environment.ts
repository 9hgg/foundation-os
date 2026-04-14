export const environment = {
	title: 'Leopar',
	production: false,
	availableThemes: ['light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro', 'cyberpunk', 'valentine', 'luxury', 'coffee'],
	api: {
		port: 8050,
	},
	articles: {
		folders: {
			blog: 'fcd62840-1b6c-4d2c-bc1d-83199c1fb7d2',
			useCases: '4bbf2d19-12ff-4ce3-8a80-cd2ada63d855',
			support: {
				articles: 'adcb6090-5c1e-49f1-bc04-0ea2811072f7',
				tutorials: 'adcb6090-5c1e-49f1-bc04-0ea2811072f7',
			},
		},
	},
	sentry: {
		domain: null,
		initConfig: {
			dsn: 'https://<not-set>',
		},
	},
};
