import { describe, it, expect, beforeEach } from 'vitest'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { context, trace } from '@opentelemetry/api'
import { instrumentRateLimitBinding } from '../../src/instrumentation/rate-limit.js'
import { AsyncLocalStorageContextManager } from '../../src/context.js'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

describe('Rate Limiting Binding Instrumentation', () => {
	beforeEach(() => {
		exporter.reset()
	})

	describe('limit', () => {
		it('should instrument successful limit check', async () => {
			const mockRateLimit = {
				limit: async (_options: { key: string }) => ({
					success: true,
				}),
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')
			const result = await instrumented.limit({ key: 'user:123' })

			expect(result).toEqual({ success: true })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('RateLimit TEST_RATE_LIMITER limit')
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.binding.type': 'RateLimit',
				'cloudflare.binding.name': 'TEST_RATE_LIMITER',
				'cloudflare.rate_limit.key': 'user:123',
				'cloudflare.rate_limit.success': true,
				'cloudflare.rate_limit.allowed': true,
			})
		})

		it('should instrument failed limit check', async () => {
			const mockRateLimit = {
				limit: async (_options: { key: string }) => ({
					success: false,
				}),
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')
			const result = await instrumented.limit({ key: 'user:456' })

			expect(result).toEqual({ success: false })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.rate_limit.key': 'user:456',
				'cloudflare.rate_limit.success': false,
				'cloudflare.rate_limit.allowed': false,
			})
		})

		it('should handle IP-based rate limiting', async () => {
			const mockRateLimit = {
				limit: async (_options: { key: string }) => ({
					success: true,
				}),
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'IP_LIMITER')
			await instrumented.limit({ key: '192.168.1.1' })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes['cloudflare.rate_limit.key']).toBe('192.168.1.1')
		})

		it('should handle complex key patterns', async () => {
			const mockRateLimit = {
				limit: async (_options: { key: string }) => ({
					success: true,
				}),
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'API_LIMITER')
			await instrumented.limit({ key: 'api:endpoint:/v1/users:method:POST' })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes['cloudflare.rate_limit.key']).toBe('api:endpoint:/v1/users:method:POST')
		})

		it('should handle null/undefined response', async () => {
			const mockRateLimit = {
				limit: async () => null,
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')
			const result = await instrumented.limit({ key: 'test' })

			expect(result).toBeNull()

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes['cloudflare.rate_limit.key']).toBe('test')
		})
	})

	describe('non-instrumented methods', () => {
		it('should not instrument unknown methods', async () => {
			const mockRateLimit = {
				limit: async () => ({ success: true }),
				customMethod: async () => 'result',
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')

			// Call non-instrumented method
			const result = await (instrumented as any).customMethod()
			expect(result).toBe('result')

			// Only limit operation should create span
			await instrumented.limit({ key: 'test' })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('RateLimit TEST_RATE_LIMITER limit')
		})

		it('should not instrument non-function properties', () => {
			const mockRateLimit = {
				limit: async () => ({ success: true }),
				someProp: 'value',
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')
			expect((instrumented as any).someProp).toBe('value')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(0)
		})
	})

	describe('multiple operations', () => {
		it('should track multiple rate limit checks', async () => {
			const mockRateLimit = {
				limit: async (options: { key: string }) => {
					// Simulate different results based on key
					if (options.key.includes('blocked')) {
						return { success: false }
					}
					return { success: true }
				},
			} as any

			const instrumented = instrumentRateLimitBinding(mockRateLimit, 'TEST_RATE_LIMITER')

			await instrumented.limit({ key: 'user:allowed' })
			await instrumented.limit({ key: 'user:blocked' })
			await instrumented.limit({ key: 'user:another-allowed' })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(3)

			expect(spans[0]?.attributes['cloudflare.rate_limit.success']).toBe(true)
			expect(spans[1]?.attributes['cloudflare.rate_limit.success']).toBe(false)
			expect(spans[2]?.attributes['cloudflare.rate_limit.success']).toBe(true)
		})
	})
})
