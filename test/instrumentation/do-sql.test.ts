import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { context, trace } from '@opentelemetry/api'
import { instrumentStorage } from '../../src/instrumentation/do-storage.js'
import { AsyncLocalStorageContextManager } from '../../src/context.js'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

describe('Durable Object SQL Storage Instrumentation', () => {
	beforeEach(() => {
		exporter.reset()
	})

	describe('exec', () => {
		it('should instrument exec operation', async () => {
			const mockStorage = {
				sql: {
					exec: vi.fn(async (_query: string, _bindings?: unknown[]) => ({
						rowsRead: 10,
						rowsWritten: 5,
					})),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			const result = await instrumented.sql.exec('SELECT * FROM users WHERE id = ?', [123])

			expect(result).toEqual({ rowsRead: 10, rowsWritten: 5 })

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Durable Object SQL exec')
			expect(spans[0]?.attributes).toMatchObject({
				'db.system.name': 'Cloudflare DO',
				'db.operation.name': 'exec',
				'db.query.text': 'SELECT * FROM users WHERE id = ?',
				'cloudflare.durable_object.query.bindings': 1,
				'cloudflare.durable_object.response.rows_read': 10,
				'cloudflare.durable_object.response.rows_written': 5,
			})
		})

		it('should handle queries without bindings', async () => {
			const mockStorage = {
				sql: {
					exec: vi.fn(async (_query: string) => ({
						rowsRead: 0,
						rowsWritten: 1,
					})),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			await instrumented.sql.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.query.text': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
				'cloudflare.durable_object.response.rows_written': 1,
			})
			expect(spans[0]?.attributes).not.toHaveProperty('cloudflare.durable_object.query.bindings')
		})

		it('should handle response without metadata', async () => {
			const mockStorage = {
				sql: {
					exec: vi.fn(async () => null),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			const result = await instrumented.sql.exec('PRAGMA foreign_keys = ON')

			expect(result).toBeNull()
			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
		})
	})

	describe('execBatch', () => {
		it('should instrument batch operations', async () => {
			const mockStorage = {
				sql: {
					execBatch: vi.fn(async (_statements: Array<{ query: string; bindings?: unknown[] }>) => [
						{ rowsRead: 5, rowsWritten: 0 },
						{ rowsRead: 0, rowsWritten: 2 },
						{ rowsRead: 3, rowsWritten: 1 },
					]),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			const results = await (instrumented.sql as any).execBatch([
				{ query: 'SELECT * FROM users WHERE active = ?', bindings: [true] },
				{ query: 'INSERT INTO logs (message) VALUES (?)', bindings: ['test'] },
				{ query: 'UPDATE users SET last_login = ? WHERE id = ?', bindings: [Date.now(), 1] },
			])

			expect(results).toHaveLength(3)

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.name).toBe('Durable Object SQL execBatch')
			expect(spans[0]?.attributes).toMatchObject({
				'db.system.name': 'Cloudflare DO',
				'db.operation.name': 'execBatch',
				'db.operation.batch.size': 3,
				'db.query.text': 'SELECT * FROM users WHERE active = ?',
				'cloudflare.durable_object.response.rows_read': 8, // 5 + 0 + 3
				'cloudflare.durable_object.response.rows_written': 3, // 0 + 2 + 1
			})
		})

		it('should handle empty batch', async () => {
			const mockStorage = {
				sql: {
					execBatch: vi.fn(async () => []),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			await (instrumented.sql as any).execBatch([])

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'db.operation.batch.size': 0,
				'cloudflare.durable_object.response.rows_read': 0,
				'cloudflare.durable_object.response.rows_written': 0,
			})
		})

		it('should handle results without metadata', async () => {
			const mockStorage = {
				sql: {
					execBatch: vi.fn(async () => [null, { rowsRead: 5 }, {}]),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)
			await (instrumented.sql as any).execBatch([{ query: 'QUERY 1' }, { query: 'QUERY 2' }, { query: 'QUERY 3' }])

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(1)
			expect(spans[0]?.attributes).toMatchObject({
				'cloudflare.durable_object.response.rows_read': 5,
				'cloudflare.durable_object.response.rows_written': 0,
			})
		})
	})

	describe('integration with KV storage', () => {
		it('should instrument both KV and SQL operations', async () => {
			const mockStorage = {
				get: vi.fn(async (_key: string) => 'value'),
				sql: {
					exec: vi.fn(async (_query: string) => ({
						rowsRead: 1,
						rowsWritten: 0,
					})),
				},
			} as any

			const instrumented = instrumentStorage(mockStorage)

			// Test KV operation
			await instrumented.get('test-key')

			// Test SQL operation
			await instrumented.sql.exec('SELECT COUNT(*) FROM users')

			const spans = exporter.getFinishedSpans()
			expect(spans).toHaveLength(2)

			// First span should be KV get
			expect(spans[0]?.name).toBe('Durable Object Storage get')
			expect(spans[0]?.attributes['db.operation.name']).toBe('get')

			// Second span should be SQL exec
			expect(spans[1]?.name).toBe('Durable Object SQL exec')
			expect(spans[1]?.attributes['db.operation.name']).toBe('exec')
		})
	})
})
