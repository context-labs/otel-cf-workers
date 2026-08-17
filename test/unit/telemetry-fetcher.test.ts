import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { InMemorySpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { OTLPExporter } from '../../src/exporter'
import { OTLPTransport } from '../../src/logs/transport'
import type { ReadableLogRecord } from '../../src/logs/types'

function exportSpans(exporter: OTLPExporter, spans: ReadableSpan[]): Promise<void> {
	return new Promise((resolve, reject) => {
		exporter.export(spans, (result) => (result.error ? reject(result.error) : resolve()))
	})
}

function exportLogs(transport: OTLPTransport, logs: ReadableLogRecord[]): Promise<void> {
	return new Promise((resolve, reject) => {
		transport.export(logs, (result) => (result.error ? reject(result.error) : resolve()))
	})
}

it.effect('routes trace exports through the supplied fetcher with its receiver intact', () =>
	Effect.tryPromise({
		try: async () => {
			const binding = {
				prefix: 'vpc:',
				fetch(this: { prefix: string }, input: RequestInfo | URL) {
					expect(this.prefix).toBe('vpc:')
					expect(String(input)).toBe('https://collector.internal/v1/traces')
					return Promise.resolve(new Response(null, { status: 200 }))
				},
			}

			const exporter = new OTLPExporter({
				url: 'https://collector.internal/v1/traces',
				fetch: binding.fetch.bind(binding),
			})
			await exportSpans(exporter, new InMemorySpanExporter().getFinishedSpans())
		},
		catch: (cause) => cause,
	}),
)

it.effect('routes log exports through the supplied fetcher', () =>
	Effect.tryPromise({
		try: async () => {
			const binding = {
				called: false,
				fetch(this: { called: boolean }, input: RequestInfo | URL, init?: RequestInit) {
					this.called = true
					expect(String(input)).toBe('https://collector.internal/v1/logs')
					expect(init?.method).toBe('POST')
					return Promise.resolve(new Response(null, { status: 200 }))
				},
			}
			const transport = new OTLPTransport({
				url: 'https://collector.internal/v1/logs',
				fetch: binding.fetch.bind(binding),
			})
			await exportLogs(transport, [
				{
					timeUnixNano: [0, 0],
					observedTimeUnixNano: [0, 0],
					severityNumber: 9,
					attributes: {},
					resource: { attributes: {} } as ReadableLogRecord['resource'],
					instrumentationScope: { name: 'test' },
					droppedAttributesCount: 0,
				},
			])
			expect(binding.called).toBe(true)
		},
		catch: (cause) => cause,
	}),
)
