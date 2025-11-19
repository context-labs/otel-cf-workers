import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { beforeEach, describe, expect, test, vitest } from 'vitest'
import { AsyncLocalStorageContextManager } from '../../src/context'
import { instrumentStorage } from '../../src/instrumentation/do-storage'
import { context, trace } from '@opentelemetry/api'

const exporter = new InMemorySpanExporter()

const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

// not entirely accurate, but enough to satisfy types
const sqlMock = {
	exec: vitest.fn().mockReturnValue(undefined),
	prepare: vitest.fn().mockReturnValue(undefined),
	ingest: vitest.fn().mockReturnValue(undefined),
	databaseSize: 0,
	Cursor: null as unknown as SqlStorageCursor<any>,
	Statement: null as unknown as SqlStorageStatement,
} as unknown as SqlStorage

// kv mock
const kvMock = {
	get: vitest.fn().mockReturnValue(undefined),
	list: vitest.fn().mockReturnValue(undefined),
	put: vitest.fn().mockReturnValue(undefined),
	delete: vitest.fn().mockReturnValue(undefined),
} as SyncKvStorage

const storage = {
	get: vitest.fn().mockResolvedValue(null),
	list: vitest.fn().mockResolvedValue(new Map()),
	put: vitest.fn().mockResolvedValue(undefined),
	delete: vitest.fn().mockResolvedValue(true),
	deleteAll: vitest.fn().mockResolvedValue(undefined),
	transaction: vitest.fn().mockResolvedValue(undefined),
	getAlarm: vitest.fn().mockResolvedValue(null),
	setAlarm: vitest.fn().mockResolvedValue(undefined),
	deleteAlarm: vitest.fn().mockResolvedValue(undefined),
	sync: vitest.fn().mockResolvedValue(undefined),
	transactionSync: vitest.fn().mockResolvedValue(undefined),
	getCurrentBookmark: vitest.fn().mockResolvedValue(''),
	getBookmarkForTime: vitest.fn().mockResolvedValue(''),
	onNextSessionRestoreBookmark: vitest.fn().mockResolvedValue(''),
	sql: sqlMock,
	waitForBookmark: vitest.fn().mockResolvedValue(null),
	ensureReplicas: vitest.fn().mockResolvedValue(null),
	disableReplicas: vitest.fn().mockResolvedValue(null),
	kv: kvMock,
} satisfies DurableObjectStorage

beforeEach(() => {
	exporter.reset()
	vitest.resetAllMocks()
})

describe('delete', () => {
	test('single key', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key')).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "db.operation.name": "delete",
			  "db.system.name": "Cloudflare DO",
			}
		`)
	})

	test('multiple keys', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete(['key1', 'key2'])).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key1",
			  "cloudflare.durable_object.kv.query.keys.count": 2,
			  "db.operation.name": "delete",
			  "db.system.name": "Cloudflare DO",
			}
		`)
	})

	test('with options', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key', { allowConcurrency: true, noCache: true })).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.allow_concurrency": true,
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "cloudflare.durable_object.no_cache": true,
			  "db.operation.name": "delete",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.delete.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot()
		expect(spans[0]?.attributes).toMatchInlineSnapshot()
		expect(spans[0]?.events).toEqual([])
	})
})

describe('deleteAll', () => {
	test('without options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.deleteAll()).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage deleteAll"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.operation.name": "deleteAll",
			  "db.system.name": "Cloudflare DO",
			}
		`)
	})

	test.skip('with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.deleteAll({
				allowConcurrency: true,
				allowUnconfirmed: true,
				noCache: true,
			}),
		).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:deleteAll"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "allowConcurrency": true,
			  "hasResult": false,
			  "noCache": true,
			  "operation": "deleteAll",
			}
		`)
	})
})

describe('get', () => {
	test('single key', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get('key')).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "db.operation.name": "get",
			  "db.system.name": "Cloudflare DO",
			}
		`)
	})

	test('multiple keys', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get(['key1', 'key2'])).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key1",
			  "cloudflare.durable_object.kv.query.keys.count": 2,
			  "db.operation.name": "get",
			  "db.system.name": "Cloudflare DO",
			}
		`)
	})

	test('with options', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get('key', { allowConcurrency: true, noCache: true })).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.allow_concurrency": true,
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "cloudflare.durable_object.no_cache": true,
			  "db.operation.name": "get",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.get.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "get",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

describe('list', () => {
	test('no args', async () => {
		const result = new Map()
		storage.list.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage list"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.operation.name": "list",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('empty object arg', async () => {
		const result = new Map()
		storage.list.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list({})).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage list"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.operation.name": "list",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.list.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:list"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "list",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

describe('put', () => {
	test('single entry', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "db.operation.name": "put",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('single entry with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put('key', 'value', {
				allowConcurrency: true,
				noCache: true,
				allowUnconfirmed: true,
			}),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.allow_concurrency": true,
			  "cloudflare.durable_object.allow_unconfirmed": true,
			  "cloudflare.durable_object.kv.query.keys": "key",
			  "cloudflare.durable_object.no_cache": true,
			  "db.operation.name": "put",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('multiple entries', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put({
				key1: 'value1',
				key2: 'value2',
			}),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.kv.query.keys": "key1",
			  "cloudflare.durable_object.kv.query.keys.count": 2,
			  "db.operation.name": "put",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('multiple entries with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put(
				{
					key1: 'value1',
					key2: 'value2',
				},
				{
					allowConcurrency: true,
					noCache: true,
					allowUnconfirmed: true,
				},
			),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "cloudflare.durable_object.allow_concurrency": true,
			  "cloudflare.durable_object.allow_unconfirmed": true,
			  "cloudflare.durable_object.kv.query.keys": "key1",
			  "cloudflare.durable_object.kv.query.keys.count": 2,
			  "cloudflare.durable_object.no_cache": true,
			  "db.operation.name": "put",
			  "db.system.name": "Cloudflare DO",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.put.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

test('sync', async () => {
	const instrument = instrumentStorage(storage)
	await expect(instrument.sync()).resolves.toBe(undefined)

	const spans = exporter.getFinishedSpans()
	expect(spans).toHaveLength(1)
	expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage sync"`)
	expect(spans[0]?.attributes).toMatchInlineSnapshot(`
		{
		  "db.operation.name": "sync",
		  "db.system.name": "Cloudflare DO",
		}
	`)
})
