import { describe, expect, it, vi } from 'vitest'

import { PromiseTracker, proxyExecutionContext } from '../../src/instrumentation/common'

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

describe('PromiseTracker', () => {
	it('waits for promises tracked by another tracked promise', async () => {
		const tracker = new PromiseTracker()
		const outer = deferred()
		const inner = deferred()

		tracker.track(
			outer.promise.then(() => {
				tracker.track(inner.promise)
			}),
		)

		let settled = false
		const waiting = tracker.wait().then(() => {
			settled = true
		})
		outer.resolve()
		await outer.promise
		await Promise.resolve()

		expect(tracker.outstandingPromiseCount).toBe(2)
		expect(settled).toBe(false)

		inner.resolve()
		await waiting
		expect(settled).toBe(true)
	})

	it('settles after tracked rejections without rejecting itself', async () => {
		const tracker = new PromiseTracker()
		const error = new Error('expected rejection')
		tracker.track(Promise.reject(error))

		await expect(tracker.wait()).resolves.toBeUndefined()
	})
})

describe('proxyExecutionContext', () => {
	it('tracks nested waitUntil calls and invokes the original with its context receiver', async () => {
		const calls: Array<{ receiver: unknown; promise: Promise<unknown> }> = []
		const context = {
			waitUntil(this: unknown, promise: Promise<unknown>) {
				calls.push({ receiver: this, promise })
			},
			passThroughOnException: vi.fn(),
		} as unknown as ExecutionContext
		const { ctx, tracker } = proxyExecutionContext(context)
		const outer = deferred()
		const inner = deferred()

		ctx.waitUntil(
			outer.promise.then(() => {
				ctx.waitUntil(inner.promise)
			}),
		)
		const waiting = tracker.wait()
		outer.resolve()
		await outer.promise
		await Promise.resolve()

		expect(calls).toHaveLength(2)
		expect(calls.every(({ receiver }) => receiver === context)).toBe(true)
		expect(tracker.outstandingPromiseCount).toBe(2)

		inner.resolve()
		await waiting
	})

	it('waits for rejected waitUntil promises without propagating the rejection', async () => {
		const waitUntil = vi.fn()
		const context = { waitUntil } as unknown as ExecutionContext
		const { ctx, tracker } = proxyExecutionContext(context)
		const rejection = Promise.reject(new Error('background failure'))

		ctx.waitUntil(rejection)

		expect(waitUntil).toHaveBeenCalledWith(rejection)
		await expect(tracker.wait()).resolves.toBeUndefined()
	})
})
