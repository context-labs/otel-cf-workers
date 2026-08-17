import { expect, it } from '@effect/vitest'
import { trace, TraceFlags } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { LogRecordImpl } from '../../src/logs/logrecord'
import { vi } from 'vitest'

const resource = resourceFromAttributes({ 'service.name': 'worker' })

it('normalizes timestamps, defaults scope, and flattens nested attributes and errors', () => {
	const root = new Error('root')
	const error = new Error('failed', { cause: root })
	const record = new LogRecordImpl({
		resource,
		timestamp: new Date(1_234),
		observedTimestamp: 2_345,
		body: { event: 'failure' },
		attributes: {
			request: { method: 'GET', metadata: { cached: false } },
			tags: ['one', 'two'],
			items: [{ id: 1 }, 'plain', null],
			error,
			skipped: undefined,
		},
	})

	expect(record.timeUnixNano).toEqual([1, 234_000_000])
	expect(record.observedTimeUnixNano).toEqual([2, 345_000_000])
	expect(record.body).toEqual({ event: 'failure' })
	expect(record.instrumentationScope).toEqual({ name: '@inference-net/otel-cf-workers' })
	expect(record.attributes).toMatchObject({
		'request.method': 'GET',
		'request.metadata.cached': false,
		tags: ['one', 'two'],
		'items.0.id': 1,
		'items.1': 'plain',
		'error.type': 'Error',
		'error.message': 'failed',
		'error.cause.type': 'Error',
		'error.cause.message': 'root',
	})
	expect(record.attributes['error.stacktrace']).toContain('Error: failed')
	expect(record.attributes).not.toHaveProperty('skipped')
})

it('correlates with the active span unless explicit trace context is supplied', () => {
	const getActiveSpan = vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
		spanContext: () => ({
			traceId: 'active-trace',
			spanId: 'active-span',
			traceFlags: TraceFlags.SAMPLED,
		}),
	} as ReturnType<typeof trace.getActiveSpan>)

	const correlated = new LogRecordImpl({ resource })
	expect(correlated).toMatchObject({
		traceId: 'active-trace',
		spanId: 'active-span',
		traceFlags: TraceFlags.SAMPLED,
	})

	const explicit = new LogRecordImpl({
		resource,
		traceId: 'explicit-trace',
		spanId: 'explicit-span',
		traceFlags: TraceFlags.NONE,
	})
	expect(explicit).toMatchObject({
		traceId: 'explicit-trace',
		spanId: 'explicit-span',
		traceFlags: TraceFlags.NONE,
	})
	getActiveSpan.mockRestore()
})
