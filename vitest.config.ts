import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { name: string; version: string }

export default defineConfig({
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
		__PACKAGE_NAME__: JSON.stringify(pkg.name),
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './test/wrangler.toml',
			},
		}),
	],
	test: {
		include: ['test/**/*.test.ts'],
		setupFiles: ['./test/setup.ts'],
		globals: false,
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json-summary', 'html'],
			include: ['src/**/*.ts'],
			exclude: ['src/types.ts', 'src/logs/types.ts', 'src/constants.ts'],
			thresholds: {
				lines: 70,
				functions: 72,
				branches: 55,
				statements: 69,
			},
		},
	},
})
