import { expect, it } from '@effect/vitest'
import { ExportResultCode } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { Effect } from 'effect'
import { OTLPTransport } from '../../src/logs/transport'
import type { ReadableLogRecord } from '../../src/logs/types'

const resource = resourceFromAttributes({ 'service.name': 'worker', replicas: 2 })

const baseRecord: ReadableLogRecord = {
	timeUnixNano: [1, 2],
	observedTimeUnixNano: [3, 4],
	severityNumber: 13,
	severityText: 'WARN',
	body: 'problem',
	attributes: { string: 'value', integer: 2, double: 1.5, bool: true, array: ['a', 2] },
	traceId: '0123456789abcdef0123456789abcdef',
	spanId: '0123456789abcdef',
	traceFlags: 1,
	resource,
	instrumentationScope: { name: 'scope', version: '1.0.0' },
	droppedAttributesCount: 3,
}

function runExport(transport: OTLPTransport, logs: ReadableLogRecord[]) {
	return Effect.tryPromise({
		try: () =>
			new Promise<Parameters<Parameters<OTLPTransport['export']>[1]>[0]>((resolve) => transport.export(logs, resolve)),
		catch: (cause) => cause,
	})
}

it.effect('posts grouped OTLP log JSON with merged headers and converted values', () =>
	Effect.gen(function* () {
		let init: RequestInit | undefined
		let cancelled = false
		const transport = new OTLPTransport({
			url: 'https://collector.example/v1/logs',
			headers: { authorization: 'Bearer token', accept: 'custom/type' },
			fetch: (_input, requestInit) => {
				init = requestInit
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
		const secondScope = { ...baseRecord, body: { event: 'object' }, instrumentationScope: { name: 'other' } }
		const result = yield* runExport(transport, [baseRecord, secondScope])

		expect(result).toEqual({ code: ExportResultCode.SUCCESS })
		expect(init?.method).toBe('POST')
		expect(init?.headers).toMatchObject({
			accept: 'custom/type',
			'content-type': 'application/json',
			authorization: 'Bearer token',
		})
		const payload = JSON.parse(String(init?.body))
		expect(payload.resourceLogs).toHaveLength(1)
		expect(payload.resourceLogs[0].scopeLogs).toHaveLength(2)
		expect(payload.resourceLogs[0].resource.attributes).toContainEqual({
			key: 'replicas',
			value: { intValue: '2' },
		})
		const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0]
		expect(record).toMatchObject({
			timeUnixNano: '1000000002',
			observedTimeUnixNano: '3000000004',
			severityNumber: 13,
			severityText: 'WARN',
			body: { stringValue: 'problem' },
			traceId: baseRecord.traceId,
			spanId: baseRecord.spanId,
			flags: 1,
			droppedAttributesCount: 3,
		})
		expect(record.attributes).toEqual([
			{ key: 'string', value: { stringValue: 'value' } },
			{ key: 'integer', value: { intValue: '2' } },
			{ key: 'double', value: { doubleValue: 1.5 } },
			{ key: 'bool', value: { boolValue: true } },
			{
				key: 'array',
				value: { arrayValue: { values: [{ stringValue: 'a' }, { intValue: '2' }] } },
			},
		])
		expect(payload.resourceLogs[0].scopeLogs[1].logRecords[0].body).toEqual({
			stringValue: JSON.stringify({ event: 'object' }),
		})
		expect(cancelled).toBe(true)
	}),
)

it.effect('filters below the configured severity without fetching', () =>
	Effect.gen(function* () {
		let calls = 0
		const transport = new OTLPTransport({
			url: 'https://collector.example/v1/logs',
			level: 'ERROR',
			fetch: () => {
				calls += 1
				return Promise.resolve(new Response(null, { status: 200 }))
			},
		})
		const result = yield* runExport(transport, [baseRecord, { ...baseRecord, severityNumber: undefined }])
		expect(result).toEqual({ code: ExportResultCode.SUCCESS })
		expect(calls).toBe(0)
	}),
)

it.effect('reports HTTP and fetch failures and cancels error response bodies', () =>
	Effect.gen(function* () {
		let cancelled = false
		const httpTransport = new OTLPTransport({
			url: 'https://collector.example/v1/logs',
			fetch: () =>
				Promise.resolve(
					new Response(
						new ReadableStream({
							cancel: () => {
								cancelled = true
							},
						}),
						{ status: 500 },
					),
				),
		})
		const httpResult = yield* runExport(httpTransport, [baseRecord])
		expect(httpResult.code).toBe(ExportResultCode.FAILED)
		expect(httpResult.error).toMatchObject({ message: 'Exporter received a statusCode: 500' })
		expect(cancelled).toBe(true)

		const networkError = new Error('network unavailable')
		const networkTransport = new OTLPTransport({
			url: 'https://collector.example/v1/logs',
			fetch: () => Promise.reject(networkError),
		})
		const networkResult = yield* runExport(networkTransport, [baseRecord])
		expect(networkResult).toEqual({ code: ExportResultCode.FAILED, error: networkError })
	}),
)

it.effect('withFetch preserves endpoint, headers, and severity filtering', () =>
	Effect.gen(function* () {
		let request: { input: RequestInfo | URL; init?: RequestInit } | undefined
		const original = new OTLPTransport({
			url: 'https://collector.example/v1/logs',
			level: 'WARN',
			headers: { authorization: 'Bearer token' },
			fetch: () => Promise.reject(new Error('old fetch should not run')),
		})
		const replaced = original.withFetch((input, init) => {
			request = { input, init }
			return Promise.resolve(new Response(null, { status: 200 }))
		})
		const result = yield* runExport(replaced, [{ ...baseRecord, severityNumber: 13 }])
		expect(result.code).toBe(ExportResultCode.SUCCESS)
		expect(String(request?.input)).toBe('https://collector.example/v1/logs')
		expect(request?.init?.headers).toMatchObject({ authorization: 'Bearer token' })
	}),
)
