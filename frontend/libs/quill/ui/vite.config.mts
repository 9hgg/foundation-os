/// <reference types="vitest" />

import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
	plugins: [angular(), nxViteTsPaths()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['src/test-setup.ts'],
		include: ['**/*.spec.ts'],
		reporters: ['default'],
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
      thresholds: { lines: 50 },
			reportsDirectory: '../../../coverage/libs/quill/ui',
		},
	},
	define: {
		'import.meta.vitest': mode !== 'production',
	},
}));
