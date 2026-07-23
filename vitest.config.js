import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

if (!process.env.WRANGLER_LOG_PATH) {
	process.env.WRANGLER_LOG_PATH = fileURLToPath(new URL('./.wrangler-logs', import.meta.url))
}

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

export default defineConfig({
	plugins: [
		cloudflareTest({
			main: './test/test-worker.ts',
			singleWorker: true,
			isolatedStorage: false,
			wrangler: {
				configPath: './test/wrangler.toml',
			},
		}),
	],
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
		__PACKAGE_NAME__: JSON.stringify(pkg.name),
	},
	test: {
		globals: true,
		setupFiles: ['./test/setup.ts'],
	},
})
