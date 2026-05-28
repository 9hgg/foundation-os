/// <reference types="vitest" />

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

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
			reportsDirectory: '../../../coverage/libs/mcp/ui',
		},
	},
	define: {
		'import.meta.vitest': mode !== 'production',
	},
}));
