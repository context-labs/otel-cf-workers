import { describe, it, expect, beforeEach } from 'vitest'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { context, trace } from '@opentelemetry/api'
import { instrumentImagesBinding } from '../../src/instrumentation/images.js'
import { AsyncLocalStorageContextManager } from '../../src/context.js'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

describe('Images Binding Instrumentation', () => {
	beforeEach(() => {
		exporter.reset()
	})

	describe('get', () => {
		it('should instrument get operation', async () => {
			const mockImages = {
				get: async (_key: string) => ({
					id: 'img-123',
					filename: 'photo.jpg',
					uploaded: '2024-01-01T00:00:00Z',
					requireSignedURLs: false,
					variants: ['public', 'thumbnail', 'hero'],
					metadata: {
						author: 'John Doe',
						tags: 'nature,landscape',
					},
				}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.get('photo-123')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Images TEST_IMAGES get')
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.binding.type': 'Images',
				'cloudflare.binding.name': 'TEST_IMAGES',
				'cloudflare.images.key': 'photo-123',
				'cloudflare.images.response.id': 'img-123',
				'cloudflare.images.response.filename': 'photo.jpg',
				'cloudflare.images.uploaded': '2024-01-01T00:00:00Z',
				'cloudflare.images.require_signed_urls': false,
				'cloudflare.images.variants.count': 3,
				'cloudflare.images.metadata.keys': 'author,tags',
			})
		})

		it('should handle minimal response', async () => {
			const mockImages = {
				get: async () => ({
					id: 'img-456',
				}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.get('minimal-image')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.images.key': 'minimal-image',
				'cloudflare.images.response.id': 'img-456',
			})
		})

		it('should handle null response', async () => {
			const mockImages = {
				get: async () => null,
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			const result = await instrumented.get('nonexistent')

			expect(result).toBeNull()
			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes['cloudflare.images.key']).toBe('nonexistent')
		})

		it('should handle requireSignedURLs flag', async () => {
			const mockImages = {
				get: async () => ({
					id: 'img-789',
					requireSignedURLs: true,
				}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.get('private-image')

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes['cloudflare.images.require_signed_urls']).toBe(true)
		})
	})

	describe('list', () => {
		it('should instrument list operation', async () => {
			const mockImages = {
				list: async (_options?: any) => ({
					images: [
						{ id: 'img-1', filename: 'photo1.jpg' },
						{ id: 'img-2', filename: 'photo2.jpg' },
						{ id: 'img-3', filename: 'photo3.jpg' },
					],
				}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.list()

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Images TEST_IMAGES list')
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.binding.type': 'Images',
				'cloudflare.binding.name': 'TEST_IMAGES',
				'cloudflare.images.list.count': 3,
			})
		})

		it('should handle empty list', async () => {
			const mockImages = {
				list: async () => ({
					images: [],
				}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.list()

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes['cloudflare.images.list.count']).toBe(0)
		})

		it('should handle response without images array', async () => {
			const mockImages = {
				list: async () => ({}),
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.list()

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			// Should not crash, just not add the count attribute
		})
	})

	describe('delete', () => {
		it('should instrument delete operation', async () => {
			const mockImages = {
				delete: async (_key: string) => {},
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			await instrumented.delete('photo-to-delete')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Images TEST_IMAGES delete')
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.binding.type': 'Images',
				'cloudflare.binding.name': 'TEST_IMAGES',
				'cloudflare.images.key': 'photo-to-delete',
			})
		})
	})

	describe('non-instrumented methods', () => {
		it('should not instrument unknown methods', async () => {
			const mockImages = {
				get: async () => ({ id: 'test' }),
				customMethod: async () => 'result',
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')

			// Call non-instrumented method
			const result = await (instrumented as any).customMethod()
			expect(result).toBe('result')

			// Only get operation should create span
			await instrumented.get('test')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Images TEST_IMAGES get')
		})

		it('should not instrument non-function properties', () => {
			const mockImages = {
				get: async () => ({ id: 'test' }),
				someProp: 'value',
			} as any

			const instrumented = instrumentImagesBinding(mockImages, 'TEST_IMAGES')
			expect((instrumented as any).someProp).toBe('value')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(0)
		})
	})
})
