import { expect, it } from '@effect/vitest'
import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { Effect } from 'effect'
import { SpanImpl } from '../../src/span'

const spanContext = {
	traceId: '00000000000000000000000000000001',
	spanId: '0000000000000001',
	traceFlags: TraceFlags.SAMPLED,
}

const linkedSpanContext = {
	traceId: '00000000000000000000000000000002',
	spanId: '0000000000000002',
	traceFlags: TraceFlags.NONE,
}

function makeSpan(onEnd: (span: SpanImpl) => void = () => undefined) {
	return new SpanImpl({
		attributes: { initial: 'value', invalid: { nested: true } },
		name: 'operation',
		onEnd: (span) => onEnd(span as SpanImpl),
		resource: resourceFromAttributes({ service: 'test' }),
		spanContext,
		parentSpanContext: linkedSpanContext,
		parentSpanId: linkedSpanContext.spanId,
		links: [{ context: linkedSpanContext }],
		spanKind: SpanKind.SERVER,
		startTime: [10, 100],
	})
}

it.effect('initializes readable span fields and sanitizes attributes', () =>
	Effect.sync(() => {
		const span = makeSpan()

		expect(span.name).toBe('operation')
		expect(span.spanContext()).toBe(spanContext)
		expect(span.parentSpanContext).toBe(linkedSpanContext)
		expect(span.parentSpanId).toBe(linkedSpanContext.spanId)
		expect(span.kind).toBe(SpanKind.SERVER)
		expect(span.startTime).toEqual([10, 100])
		expect(span.attributes).toEqual({ initial: 'value' })
		expect(span.links).toEqual([{ context: linkedSpanContext }])
		expect(span.status).toEqual({ code: SpanStatusCode.UNSET })
		expect(span.instrumentationScope.name).toBe('@inference-net/otel-cf-workers')
		expect(span.isRecording()).toBe(true)
		expect(span.ended).toBe(false)
		expect(span.duration).toEqual([0, 0])
	}),
)

it.effect('updates attributes, links, status, and name while recording', () =>
	Effect.sync(() => {
		const span = makeSpan()
		const link = { context: spanContext, attributes: { linked: true } }

		const result = span
			.setAttribute('count', 2)
			.setAttribute('', 'ignored')
			.setAttribute('invalid', undefined)
			.setAttributes({ enabled: true, list: ['a', 'b'] })
			.addLink(link)
			.addLinks([{ context: spanContext }])
			.setStatus({ code: SpanStatusCode.ERROR, message: 'failed' })
			.updateName('renamed')

		expect(result).toBe(span)
		expect(span.attributes).toEqual({
			initial: 'value',
			count: 2,
			enabled: true,
			list: ['a', 'b'],
		})
		expect(span.links).toEqual([{ context: linkedSpanContext }, link, { context: spanContext }])
		expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'failed' })
		expect(span.name).toBe('renamed')
	}),
)

it.effect('records events using both overloads and sanitizes event attributes', () =>
	Effect.sync(() => {
		const span = makeSpan()

		span.addEvent('with-attributes', { valid: 'yes', invalid: { nested: true } } as unknown as never, [11, 200])
		span.addEvent('with-time', [12, 300])

		expect(span.events).toEqual([
			{ name: 'with-attributes', attributes: { valid: 'yes' }, time: [11, 200] },
			{ name: 'with-time', attributes: {}, time: [12, 300] },
		])
	}),
)

it.effect('records string and Error exceptions as semantic events', () =>
	Effect.sync(() => {
		const span = makeSpan()
		const error = new Error('boom')
		error.name = 'CustomError'

		span.recordException('plain failure', [12, 0])
		span.recordException(error, [13, 0])

		expect(span.events[0]).toEqual({
			name: 'exception',
			attributes: { 'exception.message': 'plain failure' },
			time: [12, 0],
		})
		expect(span.events[1]?.name).toBe('exception')
		expect(span.events[1]?.time).toEqual([13, 0])
		expect(span.events[1]?.attributes).toMatchObject({
			'exception.type': 'CustomError',
			'exception.message': 'boom',
		})
		expect(span.events[1]?.attributes?.['exception.stacktrace']).toContain('CustomError: boom')
	}),
)

it.effect('ends once, computes duration, and invokes onEnd once', () =>
	Effect.sync(() => {
		const ended: SpanImpl[] = []
		const span = makeSpan((value) => ended.push(value))

		span.end([12, 300])
		span.end([20, 0])

		expect(span.endTime).toEqual([12, 300])
		expect(span.duration).toEqual([2, 200])
		expect(span.isRecording()).toBe(false)
		expect(span.ended).toBe(true)
		expect(ended).toEqual([span])
	}),
)

it.effect('ignores mutations after the span has ended', () =>
	Effect.sync(() => {
		const span = makeSpan()
		span.end([12, 0])

		span
			.setAttribute('late', true)
			.setAttributes({ another: 'late' })
			.addEvent('late-event', [13, 0])
			.addLink({ context: spanContext })
			.addLinks([{ context: spanContext }])
			.setStatus({ code: SpanStatusCode.ERROR })
			.updateName('late-name')
		span.recordException('late-exception', [13, 0])

		expect(span.attributes).toEqual({ initial: 'value' })
		expect(span.events).toEqual([])
		expect(span.links).toEqual([{ context: linkedSpanContext }])
		expect(span.status).toEqual({ code: SpanStatusCode.UNSET })
		expect(span.name).toBe('operation')
	}),
)

it.effect('uses default kind and empty links when omitted', () =>
	Effect.sync(() => {
		const span = new SpanImpl({
			attributes: undefined,
			name: 'defaulted',
			onEnd: () => undefined,
			resource: resourceFromAttributes({}),
			spanContext,
			startTime: new Date(1_234),
		})

		expect(span.kind).toBe(SpanKind.INTERNAL)
		expect(span.links).toEqual([])
		expect(span.attributes).toEqual({})
		expect(span.startTime).toEqual([1, 234_000_000])
		expect(span.droppedAttributesCount).toBe(0)
		expect(span.droppedEventsCount).toBe(0)
		expect(span.droppedLinksCount).toBe(0)
	}),
)
