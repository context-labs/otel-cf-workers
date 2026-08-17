import { SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrumentStorage } from '../../src/instrumentation/do-storage'
import { instrumentR2Bucket } from '../../src/instrumentation/r2'

function mockTracer() {
	const span = {
		end: vi.fn(),
		recordException: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
	} as unknown as Span
	const tracer = {
		startActiveSpan: vi.fn((...args: unknown[]) => {
			const callback = args.at(-1) as (span: Span) => unknown
			return callback(span)
		}),
	} as unknown as Tracer
	vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
	return span
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('binding instrumentation lifecycle', () => {
	it('preserves the synchronous R2 resumeMultipartUpload return', () => {
		const span = mockTracer()
		const upload = { uploadId: 'upload-id' } as R2MultipartUpload
		const bucket = instrumentR2Bucket(
			{
				resumeMultipartUpload: vi.fn(() => upload),
			} as unknown as R2Bucket,
			'MY_BUCKET',
		)

		const result = bucket.resumeMultipartUpload('key', 'upload-id')

		expect(result).toBe(upload)
		expect(result).not.toBeInstanceOf(Promise)
		expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
		expect(span.end).toHaveBeenCalledOnce()
	})

	it('preserves the synchronous Durable Object transactionSync return', () => {
		const span = mockTracer()
		const storage = instrumentStorage({
			transactionSync: vi.fn((closure) => closure()),
		} as unknown as DurableObjectStorage)

		const result = storage.transactionSync(() => ({ committed: true }))

		expect(result).toEqual({ committed: true })
		expect(result).not.toBeInstanceOf(Promise)
		expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
		expect(span.end).toHaveBeenCalledOnce()
	})

	it('ends rejected R2 operations with an error status', async () => {
		const span = mockTracer()
		const error = new Error('R2 rejected')
		const bucket = instrumentR2Bucket(
			{
				get: vi.fn(() => Promise.reject(error)),
			} as unknown as R2Bucket,
			'MY_BUCKET',
		)

		await expect(bucket.get('key')).rejects.toBe(error)
		expect(span.recordException).toHaveBeenCalledWith(error)
		expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
		expect(span.end).toHaveBeenCalledOnce()
	})

	it('ends rejected Durable Object storage operations with an error status', async () => {
		const span = mockTracer()
		const error = new Error('storage rejected')
		const storage = instrumentStorage({ get: vi.fn(() => Promise.reject(error)) } as unknown as DurableObjectStorage)

		await expect(storage.get('key')).rejects.toBe(error)
		expect(span.recordException).toHaveBeenCalledWith(error)
		expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
		expect(span.end).toHaveBeenCalledOnce()
	})
})
