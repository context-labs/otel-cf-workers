import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
		__PACKAGE_NAME__: JSON.stringify(pkg.name),
	},
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
			fileName: 'index',
		},
		rollupOptions: {
			external: (id) => {
				if (id.startsWith('node:') || id.startsWith('cloudflare:')) return true
				// OTel deps (including @opentelemetry/api) are bundled so their ESM builds get tree-shaken:
				// consumers' bundlers (wrangler/esbuild) resolve them to CJS and pull in everything, which
				// dominated cold start. A user's own copy of @opentelemetry/api still interoperates via the
				// API's global registry (Symbol.for('opentelemetry.js.api.1')).
				// External test directory
				if (id.includes('/test/') || id.includes('\\test\\')) return true
				return false
			},
		},
		sourcemap: true,
		target: 'esnext',
		minify: true,
	},
	plugins: [
		dts({
			rollupTypes: true,
			tsconfigPath: './tsconfig.json',
			exclude: ['test/**/*'],
		}),
	],
})
