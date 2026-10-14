import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { SpanStatusCode } from '@opentelemetry/api'
import { expect, it, vi } from 'vitest'
import { ATTR_RPC_METHOD } from '../../src/constants'
import { getSpans, rpcGate, traceProcessor } from '../test-worker'

// Instrumented RPC methods also accept a trace context carrier as the first argument.
type TestDO = {
	rpcPing(...args: unknown[]): Promise<{ ok: boolean }>
	rpcFail(): Promise<never>
	rpcHeld(...args: unknown[]): Promise<{ ok: boolean }>
}

const newStub = () => env.TEST_DO.get(env.TEST_DO.newUniqueId())
const heldTraces = () => Object.keys(Reflect.get(traceProcessor, 'traces'))

// The test pool's RPC stubs read methods off the class prototype, bypassing the instrumented
// instance. The Workers runtime calls them on the instance, as `runInDurableObject` lets us do.
const rpc = <T>(stub: DurableObjectStub, call: (instance: TestDO) => Promise<T>) =>
	runInDurableObject(stub, (instance) => call(instance as unknown as TestDO))

it('releases trace state after each RPC, fetch and alarm invocation', async () => {
	const stub = newStub()
	for (let i = 0; i < 10; i++) {
		await rpc(stub, (instance) => instance.rpcPing())
		await (await stub.fetch('https://do.example/storage/write')).arrayBuffer()
		await runInDurableObject(stub, (_instance, state) => state.storage.setAlarm(Date.now() + 60_000))
		expect(await runDurableObjectAlarm(stub)).toBe(true)
	}
	await vi.waitFor(() => expect(heldTraces()).toEqual([]))
})

it('releases trace state after throwing invocations', async () => {
	const stub = newStub()
	for (let i = 0; i < 10; i++) {
		await expect(rpc(stub, (instance) => instance.rpcFail())).rejects.toThrow('rpc failed')
		await expect(stub.fetch('https://do.example/throw')).rejects.toThrow('fetch failed')
	}
	await vi.waitFor(() => expect(heldTraces()).toEqual([]))
})

it('keeps a trace until its last concurrent invocation ends, without ending its spans early', async () => {
	const stub = newStub()
	const traceId = '0af7651916cd43dd8448eb211c80319c'
	// What an instrumented caller passes as the first RPC argument.
	const carrier = { __otel_rpc_ctx__: true, headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` } }
	const heldSpans = () => getSpans().filter((span) => span.attributes[ATTR_RPC_METHOD] === 'rpcHeld')

	let release!: () => void
	const started = new Promise<void>((resolve) => (rpcGate.started = resolve))
	rpcGate.release = new Promise((resolve) => (release = resolve))
	await rpc(stub, async (instance) => {
		const held = instance.rpcHeld(carrier)
		await started

		await instance.rpcPing(carrier)
		await scheduler.wait(20)
		expect(heldTraces()).toContain(traceId)
		expect(heldSpans()).toEqual([])

		release()
		expect(await held).toEqual({ ok: true })
	})
	await vi.waitFor(() => expect(heldTraces()).not.toContain(traceId))
	expect(heldSpans()).toHaveLength(1)
	expect(heldSpans()[0]!.status.code).toBe(SpanStatusCode.OK)
})
