import { instrument, instrumentDO, ResolveConfigFn } from '../../../src/index'
import handler, { Env, OtelDO } from './handler'

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: env['otel.exporter.url'],
			headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
		},
		service: {
			name: 'greetings',
			version: '0.1',
		},
	}
}

const doConfig: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: env['otel.exporter.url'],
			headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
		},
		service: { name: 'greetings-do' },
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export default instrument(handler, config)

export { TestOtelDO }
