import { instrument, instrumentDO, ResolveConfigFn } from '../../../src/index';
import handler, { MyDurableObject as MyDO } from './handler';

type WithSecretEnv = Env & { 'otel.exporter.url': string; 'otel.exporter.headers.signoz-access-token': string };

const config: ResolveConfigFn = (env: WithSecretEnv, _trigger) => {
	return {
		exporter: {
			url: env['otel.exporter.url'],
			headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
		},
		service: {
			name: 'new-style-greetings',
			version: '0.1',
		},
	};
};

const doConfig: ResolveConfigFn = (env: WithSecretEnv) => {
	return {
		exporter: {
			url: env['otel.exporter.url'],
			headers: { 'signoz-access-token': env['otel.exporter.headers.signoz-access-token'] },
		},
		service: { name: 'new-style-greetings-do' },
	};
};

const MyDurableObject = instrumentDO(MyDO, doConfig);

export default instrument(handler, config);

export { MyDurableObject };
