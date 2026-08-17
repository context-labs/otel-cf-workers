import { SpanKind, SpanStatusCode, trace, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrumentKV } from '../../src/instrumentation/kv'

type SpanRecord = {
	name: string
	options?: SpanOptions
	span: Span
}

function mockTracer() {
	const records: SpanRecord[] = []
	const tracer = {
		startActiveSpan: vi.fn((name: string, ...args: unknown[]) => {
			const callback = args.at(-1) as (span: Span) => unknown
			const options = args.length > 1 ? (args[0] as SpanOptions) : undefined
			const span = {
				end: vi.fn(),
				recordException: vi.fn(),
				setAttribute: vi.fn(),
				setAttributes: vi.fn(),
				setStatus: vi.fn(),
			} as unknown as Span
			records.push({ name, options, span })
			return callback(span)
		}),
	} as unknown as Tracer
	vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
	return records
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('KV instrumentation', () => {
	it('records operation identity, rich get options, keys, and preserves receiver/result', async () => {
		const records = mockTracer()
		const result = new ArrayBuffer(4)
		const namespace = {
			marker: 'namespace',
			get: vi.fn(function (this: { marker: string }) {
				expect(this.marker).toBe('namespace')
				return Promise.resolve(result)
			}),
		}
		const kv = instrumentKV(namespace as unknown as KVNamespace, 'CACHE')
		const typedKV = kv as unknown as {
			get(keys: string[], options: { type: string; cacheTtl: number }): Promise<ArrayBuffer>
		}

		await expect(typedKV.get(['a', 'b'], { type: 'arrayBuffer', cacheTtl: 60 })).resolves.toBe(result)

		const record = records[0]
		expect(record?.name).toBe('KV CACHE get')
		expect(record?.options).toEqual({
			kind: SpanKind.CLIENT,
			attributes: {
				'cloudflare.binding.type': 'KV',
				'cloudflare.binding.name': 'CACHE',
				'db.name': 'CACHE',
				'db.system.name': 'Cloudflare KV',
				'db.operation.name': 'get',
			},
		})
		expect(record?.span.setAttributes).toHaveBeenCalledWith({
			'cloudflare.kv.query.type': 'arrayBuffer',
			'cloudflare.kv.query.cache_ttl': 60,
		})
		expect(record?.span.setAttribute).toHaveBeenCalledWith('cloudflare.kv.query.keys', 'a')
		expect(record?.span.setAttribute).toHaveBeenCalledWith('cloudflare.kv.query.keys.count', 2)
		expect(record?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
		expect(record?.span.end).toHaveBeenCalledOnce()
	})

	it('records put options and metadata-bearing results', async () => {
		const records = mockTracer()
		const metadataResult = { value: 'value', metadata: { source: 'edge' }, cacheStatus: 'hit' }
		const kv = instrumentKV(
			{
				put: vi.fn(() => Promise.resolve()),
				getWithMetadata: vi.fn(() => Promise.resolve(metadataResult)),
			} as unknown as KVNamespace,
			'CACHE',
		)

		await kv.put('key', new Uint8Array([1]), {
			expiration: 2_000_000_000,
			expirationTtl: 120,
			metadata: { owner: 'test' },
		})
		await expect(kv.getWithMetadata('key', { type: 'text', cacheTtl: 30 })).resolves.toBe(metadataResult)

		expect(records[0]?.span.setAttributes).toHaveBeenCalledWith({
			'cloudflare.kv.query.value_type': 'object',
			'cloudflare.kv.query.expiration': 2_000_000_000,
			'cloudflare.kv.query.expiration_ttl': 120,
			'cloudflare.kv.query.metadata': '{"owner":"test"}',
		})
		expect(records[1]?.span.setAttributes).toHaveBeenCalledWith({
			'cloudflare.kv.query.type': 'text',
			'cloudflare.kv.query.cache_ttl': 30,
			'cloudflare.kv.response.metadata': '{"source":"edge"}',
			'cloudflare.kv.response.cache_status': 'hit',
		})
	})

	it('records list options and pagination results without key attributes', async () => {
		const records = mockTracer()
		const result = { keys: [], list_complete: false, cursor: 'next', cacheStatus: 'miss' }
		const kv = instrumentKV({ list: vi.fn(() => Promise.resolve(result)) } as unknown as KVNamespace, 'CACHE')

		await expect(kv.list({ prefix: 'user:', limit: 25, cursor: 'current' })).resolves.toBe(result)

		expect(records[0]?.span.setAttributes).toHaveBeenCalledWith({
			'cloudflare.kv.query.cursor': 'current',
			'cloudflare.kv.query.limit': 25,
			'cloudflare.kv.query.prefix': 'user:',
			'cloudflare.kv.response.list_complete': false,
			'cloudflare.kv.response.cursor': 'next',
			'cloudflare.kv.response.cache_status': 'miss',
		})
		expect(records[0]?.span.setAttribute).not.toHaveBeenCalled()
	})

	it('records and rethrows the original error while ending the span', async () => {
		const records = mockTracer()
		const error = new Error('KV failed')
		const kv = instrumentKV({ delete: vi.fn(() => Promise.reject(error)) } as unknown as KVNamespace, 'CACHE')

		await expect(kv.delete('key')).rejects.toBe(error)

		expect(records[0]?.span.recordException).toHaveBeenCalledWith(error)
		expect(records[0]?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
		expect(records[0]?.span.end).toHaveBeenCalledOnce()
	})
})
