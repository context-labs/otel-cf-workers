import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { ExportResultCode } from '@opentelemetry/core'
import {
	BatchSizeLogRecordProcessor,
	createLogProcessor,
	ImmediateLogRecordProcessor,
	MultiTransportLogRecordProcessor,
} from '../../src/logs/logprocessor'
import type { LogTransport, ReadableLogRecord } from '../../src/logs/types'
import { vi } from 'vitest'

const record = {} as ReadableLogRecord

it.effect('flushes every queued log batch', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: number[] = []
			const transport: LogTransport = {
				name: 'test',
				export: (logs, callback) => {
					batches.push(logs.length)
					callback({ code: ExportResultCode.SUCCESS })
				},
				shutdown: () => Promise.resolve(),
			}
			const processor = new BatchSizeLogRecordProcessor(transport, { maxExportBatchSize: 2 })
			processor.onEmit(record, {} as never)
			processor.onEmit(record, {} as never)
			processor.onEmit(record, {} as never)
			processor.onEmit(record, {} as never)
			processor.onEmit(record, {} as never)

			await processor.forceFlush()
			expect(batches).toEqual([2, 2, 1])
		},
		catch: (cause) => cause,
	}),
)

it.effect('retains failures for forceFlush', () =>
	Effect.gen(function* () {
		const transport: LogTransport = {
			name: 'test',
			export: (_logs, callback) => callback({ code: ExportResultCode.FAILED, error: new Error('failed') }),
			shutdown: () => Promise.resolve(),
		}
		const processor = new BatchSizeLogRecordProcessor(transport, { maxExportBatchSize: 2 })
		processor.onEmit(record, {} as never)
		const result = yield* Effect.result(
			Effect.tryPromise({
				try: () => processor.forceFlush(),
				catch: (cause) => cause,
			}),
		)
		expect(result._tag).toBe('Failure')
	}),
)

it.effect('immediate processor exports records, flushes pending work, and shuts down transport', () =>
	Effect.gen(function* () {
		let complete: (() => void) | undefined
		let shutdown = false
		const batches: ReadableLogRecord[][] = []
		const transport: LogTransport = {
			name: 'test',
			export: (logs, callback) => {
				batches.push(logs)
				complete = () => callback({ code: ExportResultCode.SUCCESS })
			},
			shutdown: () => {
				shutdown = true
				return Promise.resolve()
			},
		}
		const processor = new ImmediateLogRecordProcessor(transport)
		processor.onEmit(record, {} as never)
		let flushed = false
		const flush = processor.forceFlush().then(() => {
			flushed = true
		})
		yield* Effect.promise(() => Promise.resolve())
		expect(flushed).toBe(false)
		complete?.()
		yield* Effect.promise(() => flush)
		expect(batches).toEqual([[record]])
		yield* Effect.promise(() => processor.shutdown())
		expect(shutdown).toBe(true)
	}),
)

it.effect('batch processor drops overflow, ignores emits after shutdown, and drains before transport shutdown', () =>
	Effect.gen(function* () {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const events: string[] = []
		const transport: LogTransport = {
			name: 'test',
			export: (logs, callback) => {
				events.push(`export:${logs.length}`)
				callback({ code: ExportResultCode.SUCCESS })
			},
			shutdown: () => {
				events.push('shutdown')
				return Promise.resolve()
			},
		}
		const processor = new BatchSizeLogRecordProcessor(transport, { maxQueueSize: 2, maxExportBatchSize: 3 })
		processor.onEmit(record, {} as never)
		processor.onEmit(record, {} as never)
		processor.onEmit(record, {} as never)
		expect(warning).toHaveBeenCalledOnce()
		yield* Effect.promise(() => processor.shutdown())
		processor.onEmit(record, {} as never)
		expect(events).toEqual(['export:2', 'shutdown'])
		warning.mockRestore()
	}),
)

it.effect('multi transport processor fans out flush and shutdown', () =>
	Effect.gen(function* () {
		const events: string[] = []
		const makeTransport = (name: string): LogTransport => ({
			name,
			export: (logs, callback) => {
				events.push(`${name}:export:${logs.length}`)
				callback({ code: ExportResultCode.SUCCESS })
			},
			shutdown: () => {
				events.push(`${name}:shutdown`)
				return Promise.resolve()
			},
		})
		const processor = new MultiTransportLogRecordProcessor([makeTransport('one'), makeTransport('two')], {
			strategy: 'size',
			maxExportBatchSize: 2,
		})
		processor.onEmit(record, {} as never)
		yield* Effect.promise(() => processor.forceFlush())
		yield* Effect.promise(() => processor.shutdown())
		expect(events).toEqual(['one:export:1', 'two:export:1', 'one:shutdown', 'two:shutdown'])
	}),
)

it('creates the configured processor strategy', () => {
	const transport: LogTransport = {
		name: 'test',
		export: (_logs, callback) => callback({ code: ExportResultCode.SUCCESS }),
		shutdown: () => Promise.resolve(),
	}
	expect(createLogProcessor(transport, { strategy: 'immediate' })).toBeInstanceOf(ImmediateLogRecordProcessor)
	expect(createLogProcessor(transport)).toBeInstanceOf(BatchSizeLogRecordProcessor)
})
