import { createContextKey, ROOT_CONTEXT, type Context } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'

import { AsyncLocalStorageContextManager } from '../../src/context'

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

const key = createContextKey('context-test')
let manager: AsyncLocalStorageContextManager

describe('AsyncLocalStorageContextManager', () => {
	it('propagates nested async contexts and restores each parent', async () => {
		manager = new AsyncLocalStorageContextManager().enable()
		const outer = ROOT_CONTEXT.setValue(key, 'outer')
		const inner = ROOT_CONTEXT.setValue(key, 'inner')

		expect(manager.active()).toBe(ROOT_CONTEXT)
		await manager.with(outer, async () => {
			expect(manager.active()).toBe(outer)
			await Promise.resolve()
			expect(manager.active()).toBe(outer)

			await manager.with(inner, async () => {
				expect(manager.active()).toBe(inner)
				await Promise.resolve()
				expect(manager.active()).toBe(inner)
			})

			expect(manager.active()).toBe(outer)
		})
		expect(manager.active()).toBe(ROOT_CONTEXT)
	})

	it('isolates concurrent asynchronous executions', async () => {
		manager = new AsyncLocalStorageContextManager().enable()
		const first = ROOT_CONTEXT.setValue(key, 'first')
		const second = ROOT_CONTEXT.setValue(key, 'second')
		const releaseFirst = deferred()
		const releaseSecond = deferred()
		const observations: Array<[string, Context]> = []

		const firstRun = manager.with(first, async () => {
			observations.push(['first-start', manager.active()])
			await releaseFirst.promise
			observations.push(['first-end', manager.active()])
		})
		const secondRun = manager.with(second, async () => {
			observations.push(['second-start', manager.active()])
			releaseFirst.resolve()
			await releaseSecond.promise
			observations.push(['second-end', manager.active()])
		})

		await firstRun
		expect(manager.active()).toBe(ROOT_CONTEXT)
		releaseSecond.resolve()
		await secondRun

		expect(observations).toEqual([
			['first-start', first],
			['second-start', second],
			['first-end', first],
			['second-end', second],
		])
		expect(manager.active()).toBe(ROOT_CONTEXT)
	})

	it('binds context while preserving the call receiver and arguments', async () => {
		manager = new AsyncLocalStorageContextManager().enable()
		const boundContext = ROOT_CONTEXT.setValue(key, 'bound')
		const receiver = {
			prefix: 'receiver',
			invoke(this: { prefix: string }, value: string) {
				return {
					active: manager.active(),
					result: `${this.prefix}:${value}`,
				}
			},
		}
		const bound = manager.bind(boundContext, receiver.invoke)

		const result = bound.call(receiver, 'argument')

		expect(result).toEqual({ active: boundContext, result: 'receiver:argument' })
		expect(bound.length).toBe(receiver.invoke.length)
		expect(manager.active()).toBe(ROOT_CONTEXT)
	})

	it('keeps bound context across awaits without leaking to the caller', async () => {
		manager = new AsyncLocalStorageContextManager().enable()
		const boundContext = ROOT_CONTEXT.setValue(key, 'bound-async')
		const bound = manager.bind(boundContext, async () => {
			expect(manager.active()).toBe(boundContext)
			await Promise.resolve()
			return manager.active()
		})

		const result = await bound()

		expect(result).toBe(boundContext)
		expect(manager.active()).toBe(ROOT_CONTEXT)
	})
})
