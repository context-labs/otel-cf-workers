import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { ExportResultCode } from '@opentelemetry/core'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { MultiSpanExporter } from '../../src/multiexporter'

const successfulExporter: SpanExporter = {
	export: (_items, callback) => callback({ code: ExportResultCode.SUCCESS }),
	shutdown: () => Promise.resolve(),
}

it.effect('calls its callback once after every exporter succeeds', () =>
	Effect.tryPromise({
		try: () =>
			new Promise<void>((resolve, reject) => {
				const exporter = new MultiSpanExporter([successfulExporter, successfulExporter])
				let callbackCount = 0
				exporter.export([], (result) => {
					callbackCount += 1
					try {
						expect(result.code).toBe(ExportResultCode.SUCCESS)
						expect(callbackCount).toBe(1)
						resolve()
					} catch (error) {
						reject(error)
					}
				})
			}),
		catch: (cause) => cause,
	}),
)

it.effect('fails once when an exporter fails', () =>
	Effect.tryPromise({
		try: () =>
			new Promise<void>((resolve, reject) => {
				const failedExporter: SpanExporter = {
					export: (_items, callback) => callback({ code: ExportResultCode.FAILED, error: new Error('failed') }),
					shutdown: () => Promise.resolve(),
				}
				const exporter = new MultiSpanExporter([successfulExporter, failedExporter])
				let callbackCount = 0
				exporter.export([], (result) => {
					callbackCount += 1
					try {
						expect(result.code).toBe(ExportResultCode.FAILED)
						expect(callbackCount).toBe(1)
						resolve()
					} catch (error) {
						reject(error)
					}
				})
			}),
		catch: (cause) => cause,
	}),
)
