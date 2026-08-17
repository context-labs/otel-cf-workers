import { expect, it } from '@effect/vitest'
import { context, SpanKind, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api'
import { ReadableSpan, SamplingDecision } from '@opentelemetry/sdk-trace-base'
import { Effect } from 'effect'
import { createSampler, isHeadSampled, isRootErrorSpan, multiTailSampler } from '../../src/sampling'

const traceId = '00000000000000000000000000000001'

function readableSpan(traceFlags: TraceFlags, statusCode = SpanStatusCode.UNSET): ReadableSpan {
	return {
		spanContext: () => ({ traceId, spanId: '0000000000000001', traceFlags }),
		status: { code: statusCode },
	} as ReadableSpan
}

function decision(ratio: number, parent?: { traceFlags: TraceFlags; isRemote?: boolean }, acceptRemote?: boolean) {
	const sampler = createSampler({ ratio, acceptRemote })
	const parentContext = parent
		? trace.setSpanContext(context.active(), {
				traceId,
				spanId: '0000000000000002',
				traceFlags: parent.traceFlags,
				isRemote: parent.isRemote,
			})
		: context.active()
	return sampler.shouldSample(parentContext, traceId, 'operation', SpanKind.INTERNAL, {}, []).decision
}

it.effect('multiTailSampler returns true when any sampler accepts and short-circuits later samplers', () =>
	Effect.sync(() => {
		const calls: string[] = []
		const sampler = multiTailSampler([
			() => {
				calls.push('first')
				return false
			},
			() => {
				calls.push('second')
				return true
			},
			() => {
				calls.push('third')
				return true
			},
		])

		expect(sampler({ traceId, localRootSpan: readableSpan(TraceFlags.NONE), spans: [] })).toBe(true)
		expect(calls).toEqual(['first', 'second'])
	}),
)

it.effect('multiTailSampler rejects when empty or every sampler rejects', () =>
	Effect.sync(() => {
		const traceInfo = { traceId, localRootSpan: readableSpan(TraceFlags.NONE), spans: [] }
		expect(multiTailSampler([])(traceInfo)).toBe(false)
		expect(multiTailSampler([() => false, () => false])(traceInfo)).toBe(false)
	}),
)

it.effect('isHeadSampled reads the sampled trace flag from the local root', () =>
	Effect.sync(() => {
		expect(isHeadSampled({ traceId, localRootSpan: readableSpan(TraceFlags.SAMPLED), spans: [] })).toBe(true)
		expect(isHeadSampled({ traceId, localRootSpan: readableSpan(TraceFlags.NONE), spans: [] })).toBe(false)
	}),
)

it.effect('isRootErrorSpan only accepts an error local root', () =>
	Effect.sync(() => {
		expect(
			isRootErrorSpan({ traceId, localRootSpan: readableSpan(TraceFlags.NONE, SpanStatusCode.ERROR), spans: [] }),
		).toBe(true)
		expect(
			isRootErrorSpan({ traceId, localRootSpan: readableSpan(TraceFlags.NONE, SpanStatusCode.OK), spans: [] }),
		).toBe(false)
	}),
)

it.effect('createSampler applies the ratio to root spans', () =>
	Effect.sync(() => {
		expect(decision(1)).toBe(SamplingDecision.RECORD_AND_SAMPLED)
		expect(decision(0)).toBe(SamplingDecision.NOT_RECORD)
	}),
)

it.effect('createSampler honors remote parent decisions by default', () =>
	Effect.sync(() => {
		expect(decision(0, { traceFlags: TraceFlags.SAMPLED, isRemote: true })).toBe(SamplingDecision.RECORD_AND_SAMPLED)
		expect(decision(1, { traceFlags: TraceFlags.NONE, isRemote: true })).toBe(SamplingDecision.NOT_RECORD)
	}),
)

it.effect('createSampler resamples remote parents when acceptRemote is false', () =>
	Effect.sync(() => {
		expect(decision(0, { traceFlags: TraceFlags.SAMPLED, isRemote: true }, false)).toBe(SamplingDecision.NOT_RECORD)
		expect(decision(1, { traceFlags: TraceFlags.NONE, isRemote: true }, false)).toBe(
			SamplingDecision.RECORD_AND_SAMPLED,
		)
	}),
)

it.effect('createSampler continues honoring local parent decisions', () =>
	Effect.sync(() => {
		expect(decision(0, { traceFlags: TraceFlags.SAMPLED }, false)).toBe(SamplingDecision.RECORD_AND_SAMPLED)
		expect(decision(1, { traceFlags: TraceFlags.NONE }, false)).toBe(SamplingDecision.NOT_RECORD)
	}),
)
