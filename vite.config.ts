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
				// Only the API peer dep stays external. Other OTel deps are bundled so their ESM builds
				// get tree-shaken; consumers' bundlers resolve them to CJS and pull in everything.
				if (id === '@opentelemetry/api' || id.startsWith('@opentelemetry/api/')) return true
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
