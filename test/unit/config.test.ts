import { describe, expect, it, vi } from 'vitest'
import { ExportResultCode } from '@opentelemetry/core'
import { AlwaysOffSampler, type ReadableSpan, type SpanProcessor } from '@opentelemetry/sdk-trace-base'

import { parseConfig } from '../../src/config'
import { OTLPExporter } from '../../src/exporter'
import { MultiTransportLogRecordProcessor } from '../../src/logs/logprocessor'
import { OTLPTransport } from '../../src/logs/transport'
import type { LogTransport } from '../../src/logs/types'
import { BatchTraceSpanProcessor } from '../../src/spanprocessor'

describe('parseConfig', () => {
	it('returns no signal configuration when neither signal is supplied', () => {
		expect(parseConfig({ service: { name: 'test' } })).toEqual({})
	})

	it('applies trace defaults while preserving supplied processors and sampler', () => {
		const processor = {
			onStart: vi.fn(),
			onEnd: vi.fn(),
			shutdown: vi.fn(() => Promise.resolve()),
			forceFlush: vi.fn(() => Promise.resolve()),
		} satisfies SpanProcessor
		const headSampler = new AlwaysOffSampler()

		const trace = parseConfig({
			service: { name: 'test' },
			trace: { spanProcessors: processor, sampling: { headSampler } },
		}).trace!

		expect(trace.spanProcessors).toEqual([processor])
		expect(trace.sampling.headSampler).toBe(headSampler)
		expect(trace.fetch.includeTraceContext).toBe(true)
		expect(trace.handlers.fetch.acceptTraceContext).toBe(true)
		expect(trace.instrumentation).toEqual({ instrumentGlobalCache: true, instrumentGlobalFetch: true })
		expect(trace.batching).toEqual({
			strategy: 'trace',
			maxQueueSize: undefined,
			maxExportBatchSize: undefined,
		})
		const spans: ReadableSpan[] = []
		expect(trace.postProcessor(spans)).toBe(spans)
		expect(trace.sampling.tailSampler).toBeTypeOf('function')
	})

	it('turns exporter configuration into a batch processor using telemetry fetch', () => {
		const configuredFetch = vi.fn<typeof globalThis.fetch>()
		const telemetryFetch = vi.fn<typeof globalThis.fetch>()

		const trace = parseConfig(
			{
				service: { name: 'test' },
				trace: {
					exporter: { url: 'https://collector.example/v1/traces', fetch: configuredFetch },
				},
			},
			telemetryFetch,
		).trace!

		expect(trace.spanProcessors).toHaveLength(1)
		expect(trace.spanProcessors[0]).toBeInstanceOf(BatchTraceSpanProcessor)
		const exporter = (trace.spanProcessors[0] as unknown as { exporter: unknown }).exporter
		expect(exporter).toBeInstanceOf(OTLPExporter)
		expect((exporter as unknown as { fetch: unknown }).fetch).toBe(telemetryFetch)
	})

	it('uses an exporter instance directly instead of wrapping it', () => {
		const exporter = {
			export: vi.fn((_spans, callback) => callback({ code: ExportResultCode.SUCCESS })),
			shutdown: vi.fn(() => Promise.resolve()),
		}

		const trace = parseConfig({ service: { name: 'test' }, trace: { exporter } }).trace!
		const processorExporter = (trace.spanProcessors[0] as unknown as { exporter: unknown }).exporter

		expect(processorExporter).toBe(exporter)
	})

	it('clones OTLP log transports with telemetry fetch and preserves other transports', () => {
		const originalFetch = vi.fn<typeof globalThis.fetch>()
		const telemetryFetch = vi.fn<typeof globalThis.fetch>()
		const otlp = new OTLPTransport({ url: 'https://collector.example/v1/logs', fetch: originalFetch })
		const custom: LogTransport = {
			name: 'custom',
			export: vi.fn((_logs, callback) => callback({ code: ExportResultCode.SUCCESS })),
			shutdown: vi.fn(() => Promise.resolve()),
		}

		const logs = parseConfig(
			{
				service: { name: 'test' },
				logs: { transports: [otlp, custom], batching: { strategy: 'immediate' } },
			},
			telemetryFetch,
		).logs!

		expect(logs.processors).toHaveLength(1)
		expect(logs.processors[0]).toBeInstanceOf(MultiTransportLogRecordProcessor)
		const processors = (logs.processors[0] as unknown as { processors: Array<{ transport: LogTransport }> }).processors
		const transports = processors.map((processor) => processor.transport)
		expect(transports[0]).not.toBe(otlp)
		expect((transports[0] as unknown as { fetch: unknown }).fetch).toBe(telemetryFetch)
		expect((otlp as unknown as { fetch: unknown }).fetch).toBe(originalFetch)
		expect(transports[1]).toBe(custom)
		expect(logs.instrumentation.instrumentConsole).toBe(false)
	})

	it('creates no log processors without transports while keeping instrumentation options', () => {
		const logs = parseConfig({
			service: { name: 'test' },
			logs: { instrumentation: { instrumentConsole: true } },
		}).logs!

		expect(logs).toEqual({ processors: [], instrumentation: { instrumentConsole: true } })
	})
})
