import { expect, it } from '@effect/vitest'
import { context, propagation } from '@opentelemetry/api'
import { Effect } from 'effect'
import { vi } from 'vitest'

import {
	extractAndRemoveRpcContext,
	extractRpcContext,
	injectRpcContext,
	isRpcContextCarrier,
} from '../../src/instrumentation/rpc-context'

it.effect('injects serializable headers and optional Durable Object name', () =>
	Effect.sync(() => {
		const inject = vi.spyOn(propagation, 'inject').mockImplementation((_ctx, carrier, setter) => {
			setter?.set(carrier, 'traceparent', '00-trace-parent')
		})
		const carrier = injectRpcContext(context.active(), 'counter')

		expect(isRpcContextCarrier(carrier)).toBe(true)
		expect(carrier).toEqual({
			__otel_rpc_ctx__: true,
			headers: { traceparent: '00-trace-parent' },
			doName: 'counter',
		})
		expect(inject).toHaveBeenCalledOnce()
		inject.mockRestore()
	}),
)

it.effect('extracts and removes only a leading RPC context carrier', () =>
	Effect.sync(() => {
		const extracted = context.active().setValue(Symbol('rpc'), 'value')
		const extract = vi.spyOn(propagation, 'extract').mockReturnValue(extracted)
		const carrier = injectRpcContext()
		const args = [carrier, 'first', 2]

		expect(extractRpcContext(carrier)).toBe(extracted)
		expect(extractAndRemoveRpcContext(args)).toEqual([extracted, ['first', 2]])
		expect(extractAndRemoveRpcContext(['first', carrier])).toEqual([undefined, ['first', carrier]])
		expect(isRpcContextCarrier(null)).toBe(false)
		expect(isRpcContextCarrier({ __otel_rpc_ctx__: false })).toBe(false)
		extract.mockRestore()
	}),
)
