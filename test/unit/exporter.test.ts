import { expect, it } from '@effect/vitest'
import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { Effect } from 'effect'
import { OTLPExporter } from '../../src/exporter'
import { TraceExportError } from '../../src/errors'

const span: ReadableSpan = {
	name: 'request',
	kind: SpanKind.SERVER,
	spanContext: () => ({
		traceId: '0123456789abcdef0123456789abcdef',
		spanId: '0123456789abcdef',
		traceFlags: TraceFlags.SAMPLED,
	}),
	startTime: [1, 2],
	endTime: [1, 12],
	status: { code: SpanStatusCode.OK },
	attributes: { route: '/users', count: 2 },
	links: [],
	events: [],
	duration: [0, 10],
	ended: true,
	resource: resourceFromAttributes({ 'service.name': 'worker' }),
	instrumentationScope: { name: 'test-scope', version: '1.0.0' },
	droppedAttributesCount: 0,
	droppedEventsCount: 0,
	droppedLinksCount: 0,
}

function runExport(exporter: OTLPExporter, spans: ReadableSpan[]) {
	return Effect.tryPromise({
		try: () =>
			new Promise<Parameters<Parameters<OTLPExporter['export']>[1]>[0]>((resolve) => exporter.export(spans, resolve)),
		catch: (cause) => cause,
	})
}

it.effect('posts serialized OTLP trace JSON with merged headers and cancels the response body', () =>
	Effect.gen(function* () {
		let request: { input: RequestInfo | URL; init?: RequestInit } | undefined
		let cancelled = false
		const exporter = new OTLPExporter({
			url: 'https://collector.example/v1/traces',
			headers: { authorization: 'Bearer token', accept: 'custom/type' },
			fetch: (input, init) => {
				request = { input, init }
				return Promise.resolve(
					new Response(
						new ReadableStream({
							cancel: () => {
								cancelled = true
							},
						}),
						{ status: 200 },
					),
				)
			},
		})

		const result = yield* runExport(exporter, [span])
		expect(result).toEqual({ code: ExportResultCode.SUCCESS })
		expect(String(request?.input)).toBe('https://collector.example/v1/traces')
		expect(request?.init?.method).toBe('POST')
		expect(request?.init?.headers).toMatchObject({
			accept: 'custom/type',
			'content-type': 'application/json',
			authorization: 'Bearer token',
		})
		expect(request?.init?.signal).toBeInstanceOf(AbortSignal)
		const payload = JSON.parse(String(request?.init?.body))
		expect(payload.resourceSpans[0].resource.attributes).toContainEqual({
			key: 'service.name',
			value: { stringValue: 'worker' },
		})
		expect(payload.resourceSpans[0].scopeSpans[0]).toMatchObject({
			scope: { name: 'test-scope', version: '1.0.0' },
		})
		expect(payload.resourceSpans[0].scopeSpans[0].spans[0]).toMatchObject({
			traceId: '0123456789abcdef0123456789abcdef',
			spanId: '0123456789abcdef',
			name: 'request',
			kind: 2,
		})
		expect(cancelled).toBe(true)
	}),
)

it.effect('reports HTTP and fetch failures as TraceExportError and cancels error responses', () =>
	Effect.gen(function* () {
		let cancelled = false
		const httpExporter = new OTLPExporter({
			url: 'https://collector.example/v1/traces',
			fetch: () =>
				Promise.resolve(
					new Response(
						new ReadableStream({
							cancel: () => {
								cancelled = true
							},
						}),
						{ status: 503 },
					),
				),
		})
		const httpResult = yield* runExport(httpExporter, [span])
		expect(httpResult.code).toBe(ExportResultCode.FAILED)
		expect(httpResult.error).toBeInstanceOf(TraceExportError)
		expect(httpResult.error?.cause).toMatchObject({ message: 'Exporter received a statusCode: 503' })
		expect(cancelled).toBe(true)

		const networkError = new Error('network unavailable')
		const networkExporter = new OTLPExporter({
			url: 'https://collector.example/v1/traces',
			fetch: () => Promise.reject(networkError),
		})
		const networkResult = yield* runExport(networkExporter, [span])
		expect(networkResult.code).toBe(ExportResultCode.FAILED)
		expect(networkResult.error).toBeInstanceOf(TraceExportError)
		expect(networkResult.error?.cause).toBe(networkError)
	}),
)
