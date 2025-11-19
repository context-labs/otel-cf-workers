import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineWorkersConfig({
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
		__PACKAGE_NAME__: JSON.stringify(pkg.name),
	},
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './examples/worker/wrangler.toml' },
			},
		},
	},
})
