import { trace, type Attributes, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrumentStorage } from '../../src/instrumentation/do-storage'

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

describe('Durable Object storage instrumentation', () => {
	it.each([
		{
			operation: 'get',
			args: [['one', 'two'], { allowConcurrency: false, noCache: true }],
			result: new Map([['one', 1]]),
			expected: {
				'cloudflare.durable_object.kv.query.keys': 'one',
				'cloudflare.durable_object.kv.query.keys.count': 2,
				'cloudflare.durable_object.allow_concurrency': false,
				'cloudflare.durable_object.no_cache': true,
			},
		},
		{
			operation: 'put',
			args: [
				{ one: 1, two: 2 },
				{ allowConcurrency: true, allowUnconfirmed: false, noCache: true },
			],
			result: undefined,
			expected: {
				'cloudflare.durable_object.kv.query.keys': 'one',
				'cloudflare.durable_object.kv.query.keys.count': 2,
				'cloudflare.durable_object.allow_concurrency': true,
				'cloudflare.durable_object.allow_unconfirmed': false,
				'cloudflare.durable_object.no_cache': true,
			},
		},
		{
			operation: 'delete',
			args: [['one', 'two'], { allowConcurrency: true, allowUnconfirmed: true, noCache: false }],
			result: 2,
			expected: {
				'cloudflare.durable_object.kv.query.keys': 'one',
				'cloudflare.durable_object.kv.query.keys.count': 2,
				'cloudflare.durable_object.kv.response.deleted_count': 2,
				'cloudflare.durable_object.allow_concurrency': true,
				'cloudflare.durable_object.allow_unconfirmed': true,
				'cloudflare.durable_object.no_cache': false,
			},
		},
		{
			operation: 'list',
			args: [
				{
					start: 'a',
					startAfter: 'b',
					end: 'z',
					prefix: 'item:',
					reverse: false,
					limit: 25,
					allowConcurrency: true,
					noCache: false,
				},
			],
			result: new Map([['item:1', 1]]),
			expected: {
				'cloudflare.durable_object.kv.query.start': 'a',
				'cloudflare.durable_object.kv.query.startAfter': 'b',
				'cloudflare.durable_object.kv.query.end': 'z',
				'cloudflare.durable_object.kv.query.prefix': 'item:',
				'cloudflare.durable_object.kv.query.reverse': false,
				'cloudflare.durable_object.kv.query.limit': 25,
				'cloudflare.durable_object.allow_concurrency': true,
				'cloudflare.durable_object.no_cache': false,
			},
		},
	] as const)(
		'preserves $operation results and records keys/options',
		async ({ operation, args, result, expected }) => {
			const captured = captureSpan()
			const fn = vi.fn().mockResolvedValue(result)
			const storage = instrumentStorage({ [operation]: fn } as unknown as DurableObjectStorage)

			const actual = await (storage[operation] as (...args: any[]) => Promise<unknown>)(...args)

			expect(actual).toBe(result)
			expect(fn).toHaveBeenCalledWith(...args)
			expect(captured.name).toBe(`Durable Object Storage ${operation}`)
			expect(captured.attributes).toEqual({
				'db.system.name': 'Cloudflare DO',
				'db.operation.name': operation,
				...expected,
			})
		},
	)
})
