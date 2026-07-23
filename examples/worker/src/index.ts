import { instrument, instrumentDO, ResolveConfigFn } from '../../../src/index'
import handler, { Env, OtelDO } from './handler'

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		service: {
			name: 'greetings',
			version: '0.1',
		},
		trace: {
			exporter: {
				url: env['otel.exporter.url'],
				headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
			},
		},
	}
}

const doConfig: ResolveConfigFn = (env: Env) => {
	return {
		service: { name: 'greetings-do' },
		trace: {
			exporter: {
				url: env['otel.exporter.url'],
				headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
			},
		},
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export default instrument(handler, config)

export { TestOtelDO }
