import { DurableObject } from 'cloudflare:workers'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

import { BatchTraceSpanProcessor, instrument, instrumentDO, type ConfigurationOption } from '../src/index'

export const spanExporter = new InMemorySpanExporter()
export const spanProcessor = new SimpleSpanProcessor(spanExporter)
// Holds per-trace state until a trace is flushed; tests assert it is released.
export const traceProcessor = new BatchTraceSpanProcessor({
	export: (_spans, callback) => callback({ code: 0 }),
	shutdown: async () => {},
})
// Lets a test hold `rpcHeld` open while other invocations run.
export const rpcGate = { started: () => {}, release: Promise.resolve() }

const resolveTestConfig: ConfigurationOption = {
	service: { name: 'otel-cf-workers-test' },
	trace: {
		spanProcessors: [spanProcessor, traceProcessor],
		instrumentation: {
			instrumentGlobalCache: false,
			instrumentGlobalFetch: false,
		},
	},
}

class TestDurableObject extends DurableObject<Env> {
	constructor(state: DurableObjectState, env: Env) {
		super(state, env)
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/storage/write') {
			await this.ctx.storage.put('do-key', 'value')
			return Response.json({ ok: true })
		}

		if (url.pathname === '/storage/read') {
			const value = await this.ctx.storage.get('do-key')
			return Response.json({ value })
		}

		if (url.pathname === '/storage/list') {
			const list = await this.ctx.storage.list()
			return Response.json({ size: list.size })
		}

		if (url.pathname === '/throw') {
			throw new Error('fetch failed')
		}

		return new Response('not found', { status: 404 })
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.get('do-key')
	}

	async rpcFail(): Promise<never> {
		await this.ctx.storage.put('rpc-fail', Date.now())
		throw new Error('rpc failed')
	}

	async rpcHeld(): Promise<{ ok: boolean }> {
		rpcGate.started()
		await rpcGate.release
		return { ok: true }
	}

	async rpcPing(): Promise<{ ok: boolean }> {
		await this.ctx.storage.put('rpc-ping', Date.now())
		return { ok: true }
	}
}

export const InstrumentedTestDO = instrumentDO(TestDurableObject, resolveTestConfig)

const worker = {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname.startsWith('/do/storage')) {
			const id = env.TEST_DO.newUniqueId()
			const stub = env.TEST_DO.get(id)
			const targetPath = url.pathname.replace('/do', '')
			const response = await stub.fetch(`https://do.example${targetPath}`)
			return response
		}

		if (url.pathname === '/do/rpc') {
			const id = env.TEST_DO.newUniqueId()
			const stub = env.TEST_DO.get(id) as DurableObjectStub & { rpcPing(): Promise<{ ok: boolean }> }
			const result = await stub.rpcPing()
			return Response.json(result)
		}

		if (url.pathname === '/r2/put') {
			await env.MY_BUCKET.put('object-key', 'test', {
				httpMetadata: { contentType: 'text/plain' },
			})
			return new Response('stored')
		}

		if (url.pathname === '/r2/get') {
			const object = await env.MY_BUCKET.get('object-key')
			if (object) {
				// Ensure the body stream is fully consumed or canceled so Miniflare can reset state.
				await object.arrayBuffer()
			}
			return new Response('fetched')
		}

		return new Response('not found', { status: 404 })
	},
} satisfies ExportedHandler<Env>

const InstrumentedWorker = instrument(worker, resolveTestConfig)

export default InstrumentedWorker

export function resetSpans() {
	spanExporter.reset()
}

export function getSpans() {
	return spanExporter.getFinishedSpans()
}
