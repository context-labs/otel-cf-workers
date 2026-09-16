import { expect, it, vi } from 'vitest'
import { BatchTraceSpanProcessor } from '../../src/spanprocessor'
import { ROOT_CONTEXT, trace } from '@opentelemetry/api'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import type { ExportResult } from '@opentelemetry/core'

it('releases completed traces after export instead of retaining every request', async () => {
	let exported = 0
	const processor = new BatchTraceSpanProcessor({
		export: (spans, callback) => {
			exported += spans.length
			callback({ code: 0 })
		},
		shutdown: async () => {},
	})
	const tracer = new BasicTracerProvider({
		spanProcessors: [processor],
	}).getTracer('retention')
	for (let i = 0; i < 1000; i++) {
		const span = tracer.startSpan('request')
		span.end()
		await processor.forceFlush(span.spanContext().traceId)
	}
	await processor.forceFlush('unknown-trace')
	expect(exported).toBe(1000)
	expect(Object.keys(Reflect.get(processor, 'traces'))).toHaveLength(0)
})

it('flushes all traces and waits for exports before releasing them', async () => {
	const callbacks: ((result: ExportResult) => void)[] = []
	const processor = new BatchTraceSpanProcessor({
		export: (_spans, callback) => {
			callbacks.push(callback)
		},
		shutdown: async () => {},
	})
	const tracer = new BasicTracerProvider({
		spanProcessors: [processor],
	}).getTracer('retention')
	tracer.startSpan('first').end()
	tracer.startSpan('second').end()
	let flushed = false
	const flushing = processor.forceFlush().then(() => {
		flushed = true
	})
	await vi.waitFor(() => expect(callbacks).toHaveLength(2))
	expect(flushed).toBe(false)
	for (const callback of callbacks) callback({ code: 0 })
	await flushing
	expect(Object.keys(Reflect.get(processor, 'traces'))).toHaveLength(0)
})

it.each([false, true])('keeps work arriving during export (already ended: %s)', async (endBeforeExportCompletes) => {
	const callbacks: ((result: ExportResult) => void)[] = []
	const processor = new BatchTraceSpanProcessor({
		export: (_spans, callback) => {
			callbacks.push(callback)
		},
		shutdown: async () => {},
	})
	const tracer = new BasicTracerProvider({
		spanProcessors: [processor],
	}).getTracer('retention')
	const root = tracer.startSpan('request')
	const id = root.spanContext().traceId
	root.end()
	const flushing = processor.forceFlush(id)
	await vi.waitFor(() => expect(callbacks).toHaveLength(1))
	const child = tracer.startSpan('late work', {}, trace.setSpan(ROOT_CONTEXT, root))
	if (endBeforeExportCompletes) child.end()
	callbacks[0]!({ code: 0 })
	await flushing
	expect(Object.keys(Reflect.get(processor, 'traces'))).toEqual([id])
	if (!endBeforeExportCompletes) child.end()
	const finalFlush = processor.forceFlush(id)
	await vi.waitFor(() => expect(callbacks).toHaveLength(2))
	callbacks[1]!({ code: 0 })
	await finalFlush
	expect(Object.keys(Reflect.get(processor, 'traces'))).toHaveLength(0)
})
