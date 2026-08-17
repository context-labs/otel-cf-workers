import { SpanKind, SpanStatusCode, trace, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrumentD1 } from '../../src/instrumentation/d1'

type SpanRecord = {
	name: string
	options?: SpanOptions
	span: Span
}

function makeSpan() {
	return {
		end: vi.fn(),
		recordException: vi.fn(),
		setAttribute: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
	} as unknown as Span
}

function mockTracer() {
	const active: SpanRecord[] = []
	const started: SpanRecord[] = []
	const tracer = {
		startActiveSpan: vi.fn((name: string, ...args: unknown[]) => {
			const callback = args.at(-1) as (span: Span) => unknown
			const options = args.length > 1 ? (args[0] as SpanOptions) : undefined
			const span = makeSpan()
			active.push({ name, options, span })
			return callback(span)
		}),
		startSpan: vi.fn((name: string, options?: SpanOptions) => {
			const span = makeSpan()
			started.push({ name, options, span })
			return span
		}),
	} as unknown as Tracer
	vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
	return { active, started }
}

const meta = {
	rows_read: 4,
	rows_written: 2,
	duration: 1.5,
	size_after: 4096,
	last_row_id: 9,
	changed_db: true,
	changes: 2,
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('D1 instrumentation', () => {
	it('instruments prepared bind/all operations with SQL, metadata, and preserved receivers/results', async () => {
		const { active } = mockTracer()
		const result = { success: true, results: [{ id: 1 }], meta }
		const boundStatement = {
			marker: 'bound',
			all: vi.fn(function (this: { marker: string }) {
				expect(this.marker).toBe('bound')
				return Promise.resolve(result)
			}),
		}
		const statement = {
			marker: 'statement',
			bind: vi.fn(function (this: { marker: string }, value: unknown) {
				expect(this.marker).toBe('statement')
				expect(value).toBe(1)
				return boundStatement
			}),
		}
		const database = {
			marker: 'database',
			prepare: vi.fn(function (this: { marker: string }, sql: string) {
				expect(this.marker).toBe('database')
				expect(sql).toBe('SELECT * FROM users WHERE id = ?')
				return statement
			}),
		}
		const db = instrumentD1(database as unknown as D1Database, 'APP_DB')

		await expect(db.prepare('SELECT * FROM users WHERE id = ?').bind(1).all()).resolves.toBe(result)

		expect(active[0]?.name).toBe('APP_DB all')
		expect(active[0]?.options).toEqual({
			kind: SpanKind.CLIENT,
			attributes: {
				'cloudflare.binding.type': 'D1',
				'db.name': 'APP_DB',
				'db.system.name': 'Cloudflare D1',
				'db.operation.name': 'all',
				'db.query.text': 'SELECT * FROM users WHERE id = ?',
			},
		})
		expect(active[0]?.span.setAttributes).toHaveBeenCalledWith({
			'cloudflare.d1.response.rows_read': 4,
			'cloudflare.d1.response.rows_written': 2,
			'cloudflare.d1.response.sql_duration_ms': 1.5,
			'cloudflare.d1.response.size_after': 4096,
			'cloudflare.d1.response.last_row_id': 9,
			'cloudflare.d1.response.changed_db': true,
			'cloudflare.d1.response.changes': 2,
		})
		expect(active[0]?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
		expect(active[0]?.span.end).toHaveBeenCalledOnce()
	})

	it('instruments exec and preserves its exact result', async () => {
		const { active } = mockTracer()
		const result = { count: 3, duration: 2 }
		const db = instrumentD1({ exec: vi.fn(() => Promise.resolve(result)) } as unknown as D1Database, 'APP_DB')

		await expect(db.exec('DELETE FROM sessions')).resolves.toBe(result)

		expect(active[0]?.name).toBe('APP_DB exec')
		expect(active[0]?.options?.attributes).toMatchObject({
			'cloudflare.binding.type': 'D1',
			'db.name': 'APP_DB',
			'db.system.name': 'Cloudflare D1',
			'db.operation.name': 'exec',
			'db.query.text': 'DELETE FROM sessions',
		})
		expect(active[0]?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
		expect(active[0]?.span.end).toHaveBeenCalledOnce()
	})

	it('records batch identity plus per-query SQL and rich results', async () => {
		const { active, started } = mockTracer()
		const results = [
			{ success: true, results: [], meta },
			{ success: true, results: [], meta: { ...meta, rows_read: 1, changes: 0 } },
		]
		const statements = [
			{ statement: 'SELECT 1', params: [] },
			{ statement: 'UPDATE users SET active = 1', params: [] },
		] as unknown as D1PreparedStatement[]
		const db = instrumentD1({ batch: vi.fn(() => Promise.resolve(results)) } as unknown as D1Database, 'APP_DB')

		await expect(db.batch(statements)).resolves.toBe(results)

		expect(active[0]?.name).toBe('APP_DB batch')
		expect(active[0]?.options).toEqual({
			kind: SpanKind.CLIENT,
			attributes: {
				'cloudflare.binding.type': 'D1',
				'db.name': 'APP_DB',
				'db.system.name': 'Cloudflare D1',
				'db.operation.name': 'batch',
			},
		})
		expect(active[0]?.span.setAttribute).toHaveBeenCalledWith('db.operation.batch.size', 2)
		expect(started.map(({ name, options }) => [name, options?.attributes?.['db.query.text']])).toEqual([
			['APP_DB batch > query', 'SELECT 1'],
			['APP_DB batch > query', 'UPDATE users SET active = 1'],
		])
		expect(started[0]?.span.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'cloudflare.d1.response.rows_read': 4,
				'cloudflare.d1.response.changes': 2,
			}),
		)
		expect(started[1]?.span.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'cloudflare.d1.response.rows_read': 1,
				'cloudflare.d1.response.changes': 0,
			}),
		)
		expect(started[0]?.span.end).toHaveBeenCalledOnce()
		expect(started[1]?.span.end).toHaveBeenCalledOnce()
		expect(active[0]?.span.end).toHaveBeenCalledOnce()
	})

	it('records and rethrows original statement and batch errors while ending all spans', async () => {
		const statementTrace = mockTracer()
		const statementError = new Error('query failed')
		const db = instrumentD1(
			{ prepare: vi.fn(() => ({ run: vi.fn(() => Promise.reject(statementError)) })) } as unknown as D1Database,
			'APP_DB',
		)

		await expect(db.prepare('BROKEN').run()).rejects.toBe(statementError)
		expect(statementTrace.active[0]?.span.recordException).toHaveBeenCalledWith(statementError)
		expect(statementTrace.active[0]?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
		expect(statementTrace.active[0]?.span.end).toHaveBeenCalledOnce()

		vi.restoreAllMocks()
		const batchTrace = mockTracer()
		const batchError = new Error('batch failed')
		const batchDb = instrumentD1({ batch: vi.fn(() => Promise.reject(batchError)) } as unknown as D1Database, 'APP_DB')
		const statements = [{ statement: 'SELECT 1', params: [] }] as unknown as D1PreparedStatement[]

		await expect(batchDb.batch(statements)).rejects.toBe(batchError)
		expect(batchTrace.active[0]?.span.recordException).toHaveBeenCalledWith(batchError)
		expect(batchTrace.active[0]?.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
		expect(batchTrace.started[0]?.span.end).toHaveBeenCalledOnce()
		expect(batchTrace.active[0]?.span.end).toHaveBeenCalledOnce()
	})
})
