import { expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { context, SpanKind, TraceFlags } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { Effect } from 'effect'
import { SpanImpl } from '../../src/span'
import { BatchTraceSpanProcessor } from '../../src/spanprocessor'

function makeSpan(processor: BatchTraceSpanProcessor, traceId: string, spanId: string, name = spanId) {
	const span = new SpanImpl({
		attributes: {},
		name,
		onEnd: (ended) => processor.onEnd(ended as unknown as ReadableSpan),
		resource: resourceFromAttributes({}),
		spanContext: { traceId, spanId, traceFlags: TraceFlags.SAMPLED },
		spanKind: SpanKind.INTERNAL,
		startTime: [1, 0],
	})
	processor.onStart(span, context.active())
	return span
}

function collectingExporter(batches: ReadableSpan[][]): SpanExporter {
	return {
		export: (spans, callback) => {
			batches.push([...spans])
			callback({ code: ExportResultCode.SUCCESS })
		},
		shutdown: () => Promise.resolve(),
	}
}

it.effect('exports all spans together when the trace completes', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches))
			const root = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001', 'root')
			const child = makeSpan(processor, '00000000000000000000000000000001', '0000000000000002', 'child')

			child.end([2, 0])
			expect(batches).toEqual([])
			root.end([3, 0])
			await processor.forceFlush()

			expect(batches).toHaveLength(1)
			expect(batches[0]?.map((span) => span.name)).toEqual(['root', 'child'])
		},
		catch: (cause) => cause,
	}),
)

it.effect('keeps independent traces in separate export batches', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches))
			const first = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001', 'first')
			const second = makeSpan(processor, '00000000000000000000000000000002', '0000000000000002', 'second')

			first.end([2, 0])
			second.end([2, 0])
			await processor.forceFlush()

			expect(batches).toHaveLength(2)
			expect(batches.map((batch) => batch.map((span) => span.name))).toEqual([['first'], ['second']])
		},
		catch: (cause) => cause,
	}),
)

it.effect('does not call the exporter when tail sampling rejects the trace', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches), () => false)
			const span = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001')

			span.end([2, 0])
			await processor.forceFlush()

			expect(batches).toEqual([])
		},
		catch: (cause) => cause,
	}),
)

it.effect('passes the complete local trace to the tail sampler once', () =>
	Effect.tryPromise({
		try: async () => {
			const sampler = vi.fn(() => true)
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches), sampler)
			const root = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001', 'root')
			const child = makeSpan(processor, '00000000000000000000000000000001', '0000000000000002', 'child')

			child.end([2, 0])
			root.end([3, 0])
			await processor.forceFlush()

			expect(sampler).toHaveBeenCalledOnce()
			expect(sampler).toHaveBeenCalledWith({
				traceId: '00000000000000000000000000000001',
				localRootSpan: root,
				spans: [root, child],
			})
		},
		catch: (cause) => cause,
	}),
)

it.effect('forceFlush ends unfinished spans and exports each span once', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches))
			const span = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001')

			await processor.forceFlush(span.spanContext().traceId)

			expect(span.ended).toBe(true)
			expect(batches).toHaveLength(1)
			expect(batches[0]).toEqual([span])
		},
		catch: (cause) => cause,
	}),
)

it.effect('forceFlush waits for an asynchronous exporter callback', () =>
	Effect.gen(function* () {
		let completeExport: (() => void) | undefined
		const exporter: SpanExporter = {
			export: (_spans, callback) => {
				completeExport = () => callback({ code: ExportResultCode.SUCCESS })
			},
			shutdown: () => Promise.resolve(),
		}
		const processor = new BatchTraceSpanProcessor(exporter)
		const span = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001')
		span.end([2, 0])

		let flushed = false
		const flush = processor.forceFlush().then(() => {
			flushed = true
		})
		yield* Effect.promise(() => Promise.resolve())
		expect(flushed).toBe(false)
		expect(completeExport).toBeTypeOf('function')
		completeExport?.()
		yield* Effect.tryPromise({ try: () => flush, catch: (cause) => cause })
		expect(flushed).toBe(true)
	}),
)

it.effect('forceFlush rejects exporter failures while onEnd reports them', () =>
	Effect.gen(function* () {
		const failure = new Error('export failed')
		const exporter: SpanExporter = {
			export: (_spans, callback) => callback({ code: ExportResultCode.FAILED, error: failure }),
			shutdown: () => Promise.resolve(),
		}
		const processor = new BatchTraceSpanProcessor(exporter)
		const span = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001')
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

		span.end([2, 0])
		const result = yield* Effect.result(
			Effect.tryPromise({ try: () => processor.forceFlush(), catch: (cause) => cause }),
		)

		expect(result._tag).toBe('Failure')
		expect(consoleError).toHaveBeenCalledWith('Failed to export trace:', failure)
		consoleError.mockRestore()
	}),
)

it.effect('shutdown flushes every active trace', () =>
	Effect.tryPromise({
		try: async () => {
			const batches: ReadableSpan[][] = []
			const processor = new BatchTraceSpanProcessor(collectingExporter(batches))
			const first = makeSpan(processor, '00000000000000000000000000000001', '0000000000000001')
			const second = makeSpan(processor, '00000000000000000000000000000002', '0000000000000002')

			await processor.shutdown()

			expect(first.ended).toBe(true)
			expect(second.ended).toBe(true)
			expect(batches.flat()).toHaveLength(2)
		},
		catch: (cause) => cause,
	}),
)
