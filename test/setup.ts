import { beforeEach, vi } from 'vitest'
import { resetSpans, spanProcessor } from './test-worker'
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base'
import type { ResolvedTraceConfig } from '../src/types'

// Create a mock config that will always be returned
const mockConfig: ResolvedTraceConfig = {
	fetch: {
		includeTraceContext: true,
	},
	handlers: {
		fetch: {
			acceptTraceContext: true,
		},
	},
	postProcessor: (spans) => spans,
	sampling: {
		headSampler: new AlwaysOnSampler(),
		tailSampler: () => true,
	},
	spanProcessors: [spanProcessor],
	instrumentation: {
		instrumentGlobalCache: false,
		instrumentGlobalFetch: false,
	},
	batching: {
		strategy: 'trace',
	},
}

// Mock the config module
vi.mock('../src/config.js', async () => {
	const actual = await vi.importActual('../src/config.js')
	return {
		...actual,
		getActiveConfig: vi.fn(() => mockConfig),
	}
})

beforeEach(() => {
	resetSpans()
})
