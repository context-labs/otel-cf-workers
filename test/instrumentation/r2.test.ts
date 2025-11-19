import { describe, it, expect, beforeEach } from 'vitest'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { context, trace } from '@opentelemetry/api'
import { instrumentR2Bucket } from '../../src/instrumentation/r2.js'
import { AsyncLocalStorageContextManager } from '../../src/context.js'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

describe('R2 Instrumentation', () => {
	beforeEach(() => {
		exporter.reset()
	})

	describe('head', () => {
		it('should instrument head operation', async () => {
			const mockBucket = {
				head: async (key: string) => ({
					key,
					size: 1024,
					etag: 'abc123',
					version: 'v1',
					uploaded: new Date('2024-01-01'),
					httpMetadata: {
						contentType: 'text/plain',
					},
					customMetadata: {},
					checksums: {},
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.head('test-key')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('R2 TEST_BUCKET head')
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.binding.type': 'R2',
				'cloudflare.binding.name': 'TEST_BUCKET',
				'db.system.name': 'Cloudflare R2',
				'db.operation.name': 'head',
				'db.query.text': 'test-key',
				'cloudflare.r2.query.key': 'test-key',
				'cloudflare.r2.response.size': 1024,
				'cloudflare.r2.response.etag': 'abc123',
			})
		})

		it('should handle null response', async () => {
			const mockBucket = {
				head: async () => null,
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			const result = await instrumented.head('nonexistent')

			expect(result).toBeNull()
			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
		})
	})

	describe('get', () => {
		it('should instrument get operation', async () => {
			const mockBucket = {
				get: async (key: string) => ({
					key,
					size: 2048,
					etag: 'def456',
					version: 'v2',
					uploaded: new Date('2024-01-02'),
					body: new ReadableStream(),
					bodyUsed: false,
					arrayBuffer: async () => new ArrayBuffer(0),
					text: async () => '',
					json: async () => ({}),
					blob: async () => new Blob(),
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.get('test-key')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'get',
				'cloudflare.r2.query.key': 'test-key',
				'cloudflare.r2.response.size': 2048,
			})
		})

		it('should capture range options', async () => {
			const mockBucket = {
				get: async () => null,
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.get('test-key', {
				range: { offset: 0, length: 100 },
			})

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.r2.query.offset': 0,
				'cloudflare.r2.query.length': 100,
			})
		})

		it('should capture suffix range', async () => {
			const mockBucket = {
				get: async () => null,
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.get('test-key', {
				range: { suffix: 100 },
			})

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.r2.query.suffix': 100,
			})
		})
	})

	describe('put', () => {
		it('should instrument put operation', async () => {
			const mockBucket = {
				put: async (key: string, _value: any) => ({
					key,
					size: 500,
					etag: 'ghi789',
					version: 'v3',
					uploaded: new Date('2024-01-03'),
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.put('test-key', 'test-value')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'put',
				'cloudflare.r2.query.key': 'test-key',
				'cloudflare.r2.response.size': 500,
			})
		})

		it('should capture put options', async () => {
			const mockBucket = {
				put: async () => ({
					key: 'test',
					size: 100,
					etag: 'abc',
					version: 'v1',
					uploaded: new Date(),
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.put('test-key', 'value', {
				httpMetadata: { contentType: 'application/json' },
				customMetadata: { foo: 'bar', baz: 'qux' },
				md5: new ArrayBuffer(16),
				storageClass: 'Standard',
			})

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.r2.put.http_metadata': true,
				'cloudflare.r2.put.custom_metadata': 'foo,baz',
				'cloudflare.r2.put.md5': true,
				'cloudflare.r2.put.storage_class': 'Standard',
			})
		})
	})

	describe('delete', () => {
		it('should instrument single key delete', async () => {
			const mockBucket = {
				delete: async (_key: string | string[]) => {},
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.delete('test-key')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'delete',
				'db.query.text': 'test-key',
				'cloudflare.r2.query.key': 'test-key',
			})
		})

		it('should instrument multiple key delete', async () => {
			const mockBucket = {
				delete: async (_keys: string | string[]) => {},
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.delete(['key1', 'key2', 'key3'])

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.query.text': 'key1',
				'cloudflare.r2.query.key': 'key1',
			})
		})
	})

	describe('list', () => {
		it('should instrument list operation', async () => {
			const mockBucket = {
				list: async (_options?: any) => ({
					objects: [
						{ key: 'obj1', size: 100, etag: 'a', version: 'v1', uploaded: new Date() },
						{ key: 'obj2', size: 200, etag: 'b', version: 'v1', uploaded: new Date() },
					],
					truncated: false,
					delimitedPrefixes: [],
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.list()

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'list',
				'cloudflare.r2.list.truncated': false,
				'cloudflare.r2.list.objects.count': 2,
			})
		})

		it('should capture list options', async () => {
			const mockBucket = {
				list: async (_options?: any) => ({
					objects: [],
					truncated: true,
					cursor: 'next-cursor',
					delimitedPrefixes: ['prefix1/', 'prefix2/'],
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.list({
				prefix: 'test/',
				limit: 10,
				delimiter: '/',
				startAfter: 'test/a',
			})

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.r2.query.prefix': 'test/',
				'cloudflare.r2.query.limit': 10,
				'cloudflare.r2.query.delimiter': '/',
				'cloudflare.r2.query.start_after': 'test/a',
				'cloudflare.r2.list.truncated': true,
				'cloudflare.r2.list.cursor': 'next-cursor',
				'cloudflare.r2.list.delimited_prefixes.count': 2,
			})
		})
	})

	describe('multipart upload', () => {
		it('should instrument createMultipartUpload', async () => {
			const mockBucket = {
				createMultipartUpload: async (key: string) => ({
					key,
					uploadId: 'upload-123',
					uploadPart: async () => ({}) as any,
					abort: async () => {},
					complete: async () => ({}) as any,
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.createMultipartUpload('large-file.zip')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'createMultipartUpload',
				'cloudflare.r2.query.key': 'large-file.zip',
				'cloudflare.r2.multipart.upload_id': 'upload-123',
			})
		})

		it('should instrument resumeMultipartUpload', async () => {
			const mockBucket = {
				resumeMultipartUpload: async (key: string, uploadId: string) => ({
					key,
					uploadId,
					uploadPart: async () => ({}) as any,
					abort: async () => {},
					complete: async () => ({}) as any,
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.resumeMultipartUpload('large-file.zip', 'upload-123')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.name': 'resumeMultipartUpload',
				'cloudflare.r2.query.key': 'large-file.zip',
				'cloudflare.r2.multipart.upload_id': 'upload-123',
			})
		})
	})

	describe('checksums', () => {
		it('should format checksums as hex strings', async () => {
			const md5Buffer = new ArrayBuffer(16)
			const md5View = new Uint8Array(md5Buffer)
			md5View.set([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0])

			const mockBucket = {
				head: async () => ({
					key: 'test',
					size: 100,
					etag: 'abc',
					version: 'v1',
					uploaded: new Date(),
					checksums: {
						md5: md5Buffer,
					},
				}),
			} as any

			const instrumented = instrumentR2Bucket(mockBucket, 'TEST_BUCKET')
			await instrumented.head('test-key')

			const spans = exporter.getFinishedSpans()
			expect(spans[0]?.attributes['cloudflare.r2.response.checksums.md5']).toBe('123456789abcdef0123456789abcdef0')
		})
	})
})
