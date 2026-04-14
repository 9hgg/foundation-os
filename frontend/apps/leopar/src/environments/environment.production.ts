export const environment = {
	title: 'Leopar',
	production: true,
	availableThemes: ['light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro', 'cyberpunk', 'valentine', 'luxury', 'coffee'],
	api: {
		port: 8005,
	},
	articles: {
		folders: {
			blog: '71a41913-4835-49b5-9370-c141b037495c',
			useCases: 'fd39a5cb-51ca-41a1-b927-f4b34f001da0',
			support: {
				articles: '150554ea-55f6-4a04-9693-13bf5b6c4363',
				tutorials: '9816c181-01ca-459a-b45e-76a45bc6116e',
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
