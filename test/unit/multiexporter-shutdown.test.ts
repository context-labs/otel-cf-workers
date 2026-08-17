import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'

import { MultiSpanExporter, MultiSpanExporterAsync } from '../../src/multiexporter'

function exporter(shutdown: () => Promise<void>): SpanExporter {
	return {
		export: (_spans, callback) => callback({ code: 0 }),
		shutdown,
	}
}

it.effect('shuts down every exporter and rejects when one fails', () =>
	Effect.gen(function* () {
		const calls: string[] = []
		const failure = new Error('shutdown failed')
		const multi = new MultiSpanExporter([
			exporter(async () => {
				calls.push('first')
			}),
			exporter(async () => {
				calls.push('second')
				throw failure
			}),
		])

		const result = yield* Effect.result(Effect.tryPromise({ try: () => multi.shutdown(), catch: (cause) => cause }))
		expect(result._tag).toBe('Failure')
		expect(calls).toEqual(['first', 'second'])
	}),
)

it.effect('async exporter delegates shutdown', () =>
	Effect.gen(function* () {
		let shutDown = false
		const multi = new MultiSpanExporterAsync([
			exporter(async () => {
				shutDown = true
			}),
		])
		yield* Effect.promise(() => multi.shutdown())
		expect(shutDown).toBe(true)
	}),
)
