import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { InMemorySpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { OTLPExporter } from '../../src/exporter'
import { OTLPTransport } from '../../src/logs/transport'
import type { ReadableLogRecord } from '../../src/logs/types'
import { instrument, type InstrumentRuntimeOptions, type WorkerOtelConfig } from '../../src/index'

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

const publicConfig: WorkerOtelConfig = {
	service: { name: 'telemetry-fetcher-test' },
	trace: {
		exporter: { url: 'https://collector.internal/v1/traces' },
		instrumentation: { instrumentGlobalCache: false, instrumentGlobalFetch: false },
	},
}

function executionContext(): ExecutionContext & { pending: Promise<unknown>[] } {
	const pending: Promise<unknown>[] = []
	return {
		pending,
		waitUntil(promise: Promise<unknown>) {
			pending.push(promise)
		},
		passThroughOnException() {},
		props: {},
	} as unknown as ExecutionContext & { pending: Promise<unknown>[] }
}

async function exercisePublicTelemetryFetcher(options: InstrumentRuntimeOptions<Record<string, unknown>>) {
	const handler = instrument(
		{
			async fetch() {
				return new Response('ok')
			},
		},
		publicConfig,
		options,
	)
	const ctx = executionContext()
	await handler.fetch!(new Request('https://worker.example'), {}, ctx)
	await Promise.all(ctx.pending)
}

it.effect('reads a direct telemetry Fetcher through the public instrument API', () =>
	Effect.tryPromise({
		try: async () => {
			const binding = {
				accessed: false,
				get fetch(): typeof globalThis.fetch {
					this.accessed = true
					return () => Promise.resolve(new Response(null, { status: 200 }))
				},
			}
			const fetcher = binding as unknown as Fetcher

			await exercisePublicTelemetryFetcher({ telemetryFetcher: fetcher })
			expect(binding.accessed).toBe(true)
		},
		catch: (cause) => cause,
	}),
)

it.effect('resolves a telemetry Fetcher from the handler environment', () =>
	Effect.tryPromise({
		try: async () => {
			const env = { marker: 'expected' }
			let resolvedEnv: Record<string, unknown> | undefined
			const binding = {
				accessed: false,
				get fetch(): typeof globalThis.fetch {
					this.accessed = true
					return () => Promise.resolve(new Response(null, { status: 200 }))
				},
			}
			const fetcher = binding as unknown as Fetcher
			const handler = instrument(
				{
					async fetch() {
						return new Response('ok')
					},
				},
				publicConfig,
				{
					telemetryFetcher: (receivedEnv) => {
						resolvedEnv = receivedEnv
						return fetcher
					},
				},
			)
			const ctx = executionContext()
			await handler.fetch!(new Request('https://worker.example'), env, ctx)
			await Promise.all(ctx.pending)

			expect(resolvedEnv).toBe(env)
			expect(binding.accessed).toBe(true)
		},
		catch: (cause) => cause,
	}),
)
