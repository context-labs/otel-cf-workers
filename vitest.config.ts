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
	},
})
