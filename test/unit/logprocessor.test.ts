import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { ExportResultCode } from '@opentelemetry/core'
import { BatchSizeLogRecordProcessor } from '../../src/logs/logprocessor'
import type { LogTransport, ReadableLogRecord } from '../../src/logs/types'

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
