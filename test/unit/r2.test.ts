import { trace, type Attributes, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrumentR2Bucket } from '../../src/instrumentation/r2'

function captureSpan() {
	const attributes: Attributes = {}
	let name = ''
	const span = {
		end: vi.fn(),
		setAttributes: vi.fn((next: Attributes) => Object.assign(attributes, next)),
		setStatus: vi.fn(),
	} as unknown as Span
	const tracer = {
		startActiveSpan: vi.fn((spanName: string, options: SpanOptions, callback: (span: Span) => unknown) => {
			name = spanName
			Object.assign(attributes, options.attributes)
			return callback(span)
		}),
	} as unknown as Tracer
	vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
	return {
		attributes,
		get name() {
			return name
		},
	}
}

afterEach(() => vi.restoreAllMocks())

describe('R2 instrumentation', () => {
	const uploaded = new Date('2024-01-02T03:04:05.000Z')
	const object = {
		key: 'key',
		size: 42,
		etag: 'etag',
		version: 'v1',
		uploaded,
	} as R2Object

	it.each([
		{
			operation: 'head',
			args: ['key'],
			result: object,
			expected: {
				'db.query.text': 'key',
				'cloudflare.r2.query.key': 'key',
				'cloudflare.r2.response.size': 42,
				'cloudflare.r2.response.etag': 'etag',
			},
		},
		{
			operation: 'get',
			args: ['key', { range: { offset: 0, length: 10 }, onlyIf: { etagMatches: 'etag' } }],
			result: object as R2ObjectBody,
			expected: {
				'db.query.text': 'key',
				'cloudflare.r2.query.key': 'key',
				'cloudflare.r2.query.offset': 0,
				'cloudflare.r2.query.length': 10,
				'cloudflare.r2.query.only_if': JSON.stringify({ etagMatches: 'etag' }),
				'cloudflare.r2.response.size': 42,
			},
		},
		{
			operation: 'put',
			args: [
				'key',
				'value',
				{
					httpMetadata: { contentType: 'text/plain' },
					customMetadata: { one: '1', two: '2' },
					md5: new ArrayBuffer(16),
					sha256: new ArrayBuffer(32),
					storageClass: 'Standard',
				},
			],
			result: object,
			expected: {
				'db.query.text': 'key',
				'cloudflare.r2.query.key': 'key',
				'cloudflare.r2.put.http_metadata': true,
				'cloudflare.r2.put.custom_metadata': 'one,two',
				'cloudflare.r2.put.md5': true,
				'cloudflare.r2.put.sha256': true,
				'cloudflare.r2.put.storage_class': 'Standard',
				'cloudflare.r2.response.size': 42,
			},
		},
		{
			operation: 'delete',
			args: [['key', 'other']],
			result: undefined,
			expected: { 'db.query.text': 'key', 'cloudflare.r2.query.key': 'key' },
		},
		{
			operation: 'list',
			args: [
				{
					prefix: 'images/',
					limit: 10,
					delimiter: '/',
					startAfter: 'images/a',
					include: ['httpMetadata', 'customMetadata'],
					cursor: 'input-cursor',
				},
			],
			result: { objects: [object], truncated: true, cursor: 'next-cursor', delimitedPrefixes: ['images/a/'] },
			expected: {
				'cloudflare.r2.query.prefix': 'images/',
				'cloudflare.r2.query.limit': 10,
				'cloudflare.r2.query.delimiter': '/',
				'cloudflare.r2.query.start_after': 'images/a',
				'cloudflare.r2.query.include': 'httpMetadata,customMetadata',
				'cloudflare.r2.list.truncated': true,
				'cloudflare.r2.list.objects.count': 1,
				'cloudflare.r2.list.delimited_prefixes.count': 1,
				'cloudflare.r2.list.cursor': 'next-cursor',
			},
		},
	] as const)(
		'preserves $operation results and records operation attributes',
		async ({ operation, args, result, expected }) => {
			const captured = captureSpan()
			const fn = vi.fn().mockResolvedValue(result)
			const bucket = instrumentR2Bucket({ [operation]: fn } as unknown as R2Bucket, 'TEST_BUCKET')

			const actual = await (bucket[operation] as (...args: any[]) => Promise<unknown>)(...args)

			expect(actual).toBe(result)
			expect(fn).toHaveBeenCalledWith(...args)
			expect(captured.name).toBe(`R2 TEST_BUCKET ${operation}`)
			expect(captured.attributes).toMatchObject({
				'cloudflare.binding.type': 'R2',
				'cloudflare.binding.name': 'TEST_BUCKET',
				'db.system.name': 'Cloudflare R2',
				'db.operation.name': operation,
				...expected,
			})
		},
	)
})
