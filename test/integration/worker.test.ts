import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SELF } from 'cloudflare:test'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'

import { getSpans } from '../test-worker'

const runRequest = Effect.fn('WorkerIntegration.runRequest')(function* (path: string) {
	const response = yield* Effect.tryPromise({
		try: () => SELF.fetch(`https://worker.example${path}`),
		catch: (cause) => cause,
	})
	return response
})

it.effect('instruments R2 put and get routes in the Workers runtime', () =>
	Effect.gen(function* () {
		const stored = yield* runRequest('/r2/put')
		expect(stored.status).toBe(200)

		const fetched = yield* runRequest('/r2/get')
		expect(fetched.status).toBe(200)

		const spans = getSpans()
		expect(spans.map((span) => span.name)).toEqual([
			'R2 MY_BUCKET put',
			'GET /r2/put',
			'R2 MY_BUCKET get',
			'GET /r2/get',
		])

		const put = spans[0]!
		const putHandler = spans[1]!
		const get = spans[2]!
		const getHandler = spans[3]!
		expect(put.parentSpanContext?.spanId).toBe(putHandler.spanContext().spanId)
		expect(get.parentSpanContext?.spanId).toBe(getHandler.spanContext().spanId)
		expect(put.spanContext().traceId).toBe(putHandler.spanContext().traceId)
		expect(get.spanContext().traceId).toBe(getHandler.spanContext().traceId)
		expect(put.attributes).toMatchObject({
			'cloudflare.binding.name': 'MY_BUCKET',
			'cloudflare.r2.query.key': 'object-key',
			'db.operation.name': 'put',
		})
		expect(get.attributes).toMatchObject({
			'cloudflare.binding.name': 'MY_BUCKET',
			'cloudflare.r2.query.key': 'object-key',
			'db.operation.name': 'get',
		})
		expect(putHandler.kind).toBe(SpanKind.SERVER)
		expect(getHandler.kind).toBe(SpanKind.SERVER)
		expect(putHandler.status.code).toBe(SpanStatusCode.OK)
		expect(getHandler.status.code).toBe(SpanStatusCode.OK)
	}),
)

it.effect('instruments Durable Object storage routes in the Workers runtime', () =>
	Effect.gen(function* () {
		const response = yield* runRequest('/do/storage/write')
		expect(response.status).toBe(200)
		const body = yield* Effect.tryPromise({
			try: () => response.json(),
			catch: (cause) => cause,
		})
		expect(body).toEqual({ ok: true })

		const spans = getSpans()
		expect(spans.map((span) => span.name)).toEqual([
			'Durable Object Storage put',
			'Durable Object Fetch ',
			'Durable Object TEST_DO',
			'GET /do/storage/write',
		])
		const [storage, doHandler, doClient, workerHandler] = spans
		expect(storage!.attributes).toMatchObject({
			'db.operation.name': 'put',
			'cloudflare.durable_object.kv.query.keys': 'do-key',
		})
		expect(storage!.parentSpanContext?.spanId).toBe(doHandler!.spanContext().spanId)
		expect(doHandler!.parentSpanContext?.spanId).toBe(doClient!.spanContext().spanId)
		expect(doClient!.parentSpanContext?.spanId).toBe(workerHandler!.spanContext().spanId)
		expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(1)
		expect(doHandler!.kind).toBe(SpanKind.SERVER)
		expect(doClient!.kind).toBe(SpanKind.CLIENT)
		expect(workerHandler!.kind).toBe(SpanKind.SERVER)
	}),
)

it.effect('records failed HTTP responses on the handler span', () =>
	Effect.gen(function* () {
		const response = yield* runRequest('/response/error')
		expect(response.status).toBe(503)

		const spans = getSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]!.name).toBe('GET /response/error')
		expect(spans[0]!.status).toMatchObject({
			code: SpanStatusCode.ERROR,
			message: 'HTTP 503: Service Unavailable',
		})
		expect(spans[0]!.attributes).toMatchObject({
			'http.response.status_code': 503,
			'http.response.body.size': 11,
			'http.mime_type': 'text/plain',
		})
	}),
)

it.effect('propagates trace context through Durable Object RPC', () =>
	Effect.gen(function* () {
		const response = yield* runRequest('/do/rpc')
		expect(response.status).toBe(200)
		expect(
			yield* Effect.tryPromise({
				try: () => response.json(),
				catch: (cause) => cause,
			}),
		).toEqual({ ok: true })

		const spans = getSpans()
		expect(spans).toHaveLength(4)
		expect(spans[0]!.name).toBe('Durable Object Storage put')
		expect(spans[1]!.name).toMatch(/\.rpcPing$/)
		expect(spans[2]!.name).toBe('RPC TEST_DO.rpcPing')
		expect(spans[3]!.name).toBe('GET /do/rpc')
		const [storage, rpcServer, rpcClient, workerHandler] = spans
		expect(storage!.parentSpanContext?.spanId).toBe(rpcServer!.spanContext().spanId)
		expect(rpcServer!.parentSpanContext?.spanId).toBe(rpcClient!.spanContext().spanId)
		expect(rpcClient!.parentSpanContext?.spanId).toBe(workerHandler!.spanContext().spanId)
		expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(1)
		expect(rpcServer!.kind).toBe(SpanKind.SERVER)
		expect(rpcClient!.kind).toBe(SpanKind.CLIENT)
		expect(rpcServer!.attributes).toMatchObject({
			'rpc.system': 'cloudflare_rpc',
			'rpc.method': 'rpcPing',
		})
	}),
)
