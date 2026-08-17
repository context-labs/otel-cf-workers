import { expect, it } from '@effect/vitest'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import type { Span } from '@opentelemetry/api'
import type { Context } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { Effect } from 'effect'
import { SEVERITY_NUMBERS } from '../../src/constants'
import { WorkerLogger } from '../../src/logs/logger'
import type { LogRecordProcessor, ReadableLogRecord } from '../../src/logs/types'
import { vi } from 'vitest'

function captureProcessor() {
	const records: ReadableLogRecord[] = []
	const contexts: Context[] = []
	const processor: LogRecordProcessor = {
		onEmit: (record, context) => {
			records.push(record)
			contexts.push(context)
		},
		forceFlush: () => Promise.resolve(),
		shutdown: () => Promise.resolve(),
	}
	return { processor, records, contexts }
}

it('emits every convenience severity with scope, body, and merged properties', () => {
	const capture = captureProcessor()
	const logger = new WorkerLogger('worker', [capture.processor], resourceFromAttributes({}), '1.2.3', {
		service: 'api',
		override: 'parent',
	})
	logger.trace('trace')
	logger.debug('debug')
	logger.info('info', { override: 'record', requestId: 'one' })
	logger.warn('warn')
	logger.error('error')
	logger.fatal('fatal')

	expect(
		capture.records.map(({ severityNumber, severityText, body }) => ({ severityNumber, severityText, body })),
	).toEqual([
		{ severityNumber: SEVERITY_NUMBERS.TRACE, severityText: 'TRACE', body: 'trace' },
		{ severityNumber: SEVERITY_NUMBERS.DEBUG, severityText: 'DEBUG', body: 'debug' },
		{ severityNumber: SEVERITY_NUMBERS.INFO, severityText: 'INFO', body: 'info' },
		{ severityNumber: SEVERITY_NUMBERS.WARN, severityText: 'WARN', body: 'warn' },
		{ severityNumber: SEVERITY_NUMBERS.ERROR, severityText: 'ERROR', body: 'error' },
		{ severityNumber: SEVERITY_NUMBERS.FATAL, severityText: 'FATAL', body: 'fatal' },
	])
	expect(capture.records[2]?.attributes).toEqual({ service: 'api', override: 'record', requestId: 'one' })
	expect(capture.records[2]?.instrumentationScope).toEqual({ name: 'worker', version: '1.2.3' })
	expect(capture.contexts).toHaveLength(6)
})

it('inherits and overrides child properties without mutating the parent', () => {
	const capture = captureProcessor()
	const parent = new WorkerLogger('worker', [capture.processor], resourceFromAttributes({}), undefined, {
		service: 'api',
		region: 'global',
	})
	const child = parent.child('request', { region: 'local', child: true })
	child.setProperties({ mutable: 'child' }).info('child', { child: 'record' })
	parent.info('parent')

	expect(capture.records[0]?.instrumentationScope.name).toBe('worker:request')
	expect(capture.records[0]?.attributes).toEqual({
		service: 'api',
		region: 'local',
		child: 'record',
		mutable: 'child',
	})
	expect(capture.records[1]?.instrumentationScope.name).toBe('worker')
	expect(capture.records[1]?.attributes).toEqual({ service: 'api', region: 'global' })
})

it('marks active spans as failed and records Error attributes for error and fatal logs', () => {
	const capture = captureProcessor()
	const setStatus = vi.fn()
	const recordException = vi.fn()
	const activeSpan: Span = {
		setStatus,
		recordException,
		spanContext: () => ({ traceId: 'trace', spanId: 'span', traceFlags: 1 }),
		setAttribute: () => activeSpan,
		setAttributes: () => activeSpan,
		addEvent: () => activeSpan,
		addLink: () => activeSpan,
		addLinks: () => activeSpan,
		updateName: () => activeSpan,
		end: () => {},
		isRecording: () => true,
	}
	const getActiveSpan = vi.spyOn(trace, 'getActiveSpan').mockReturnValue(activeSpan)
	const logger = new WorkerLogger('worker', [capture.processor], resourceFromAttributes({}))
	const error = new Error('failed')
	logger.error('error message', { error })
	logger.fatal('fatal message', { error })

	expect(setStatus).toHaveBeenNthCalledWith(1, { code: SpanStatusCode.ERROR, message: 'error message' })
	expect(setStatus).toHaveBeenNthCalledWith(2, { code: SpanStatusCode.ERROR, message: 'fatal message' })
	expect(recordException).toHaveBeenCalledTimes(2)
	expect(capture.records[0]).toMatchObject({ traceId: 'trace', spanId: 'span' })
	expect(capture.records[0]?.attributes['error.message']).toBe('failed')
	getActiveSpan.mockRestore()
})

it.effect('forceFlush attempts every processor even when one rejects', () =>
	Effect.gen(function* () {
		const flushed: string[] = []
		const makeProcessor = (name: string, reject: boolean): LogRecordProcessor => ({
			onEmit: () => {},
			forceFlush: () => {
				flushed.push(name)
				return reject ? Promise.reject(new Error(name)) : Promise.resolve()
			},
			shutdown: () => Promise.resolve(),
		})
		const logger = new WorkerLogger(
			'worker',
			[makeProcessor('failed', true), makeProcessor('success', false)],
			resourceFromAttributes({}),
		)
		yield* Effect.promise(() => logger.forceFlush())
		expect(flushed).toEqual(['failed', 'success'])
	}),
)
