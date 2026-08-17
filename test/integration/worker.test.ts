import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SELF } from 'cloudflare:test'

const runRequest = Effect.fn('WorkerIntegration.runRequest')(function* (path: string) {
	const response = yield* Effect.tryPromise({
		try: () => SELF.fetch(`https://worker.example${path}`),
		catch: (cause) => cause,
	})
	return response
})

it.effect('instruments R2 put and get routes in the Workers runtime', () =>
	Effect.gen(function* () {
		const stored = yield* runRequest('/r2/put')
		expect(stored.status).toBe(200)

		const fetched = yield* runRequest('/r2/get')
		expect(fetched.status).toBe(200)
	}),
)

it.effect('instruments Durable Object storage routes in the Workers runtime', () =>
	Effect.gen(function* () {
		const response = yield* runRequest('/do/storage/write')
		expect(response.status).toBe(200)
		const body = yield* Effect.tryPromise({
			try: () => response.json(),
			catch: (cause) => cause,
		})
		expect(body).toEqual({ ok: true })
	}),
)
