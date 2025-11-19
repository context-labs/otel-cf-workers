import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap.js'
import {
	ATTR_CLOUDFLARE_BINDING_TYPE,
	ATTR_CLOUDFLARE_BINDING_NAME,
	ATTR_CLOUDFLARE_RATE_LIMIT_KEY,
	ATTR_CLOUDFLARE_RATE_LIMIT_ALLOWED,
	ATTR_CLOUDFLARE_RATE_LIMIT_SUCCESS,
} from '../constants.js'

// Note: Rate Limiting binding types - using duck typing since not in @cloudflare/workers-types
type RateLimitBinding = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>
	[key: string]: unknown
}

// Instrument LIMIT operation
function instrumentRateLimitLimit(fn: Function, name: string): Function {
	const tracer = trace.getTracer('rate_limit')
	const handler: ProxyHandler<Function> = {
		apply: (target, thisArg, argArray) => {
			const options = argArray[0] as { key: string }
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'RateLimit',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_CLOUDFLARE_RATE_LIMIT_KEY]: options.key,
			}
			const spanOptions: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`RateLimit ${name} limit`, spanOptions, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as { success: boolean }

				// Add result attributes
				if (result && typeof result === 'object') {
					attributes[ATTR_CLOUDFLARE_RATE_LIMIT_SUCCESS] = result.success
					// Determine if the request was allowed based on success
					attributes[ATTR_CLOUDFLARE_RATE_LIMIT_ALLOWED] = result.success
				}

				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

export function instrumentRateLimitBinding(rateLimit: RateLimitBinding, name: string): RateLimitBinding {
	const rateLimitHandler: ProxyHandler<RateLimitBinding> = {
		get: (target, prop, receiver) => {
			const fn = Reflect.get(target, prop, receiver)

			// Don't instrument non-function properties
			if (typeof fn !== 'function') {
				return fn
			}

			switch (String(prop)) {
				case 'limit':
					return instrumentRateLimitLimit(fn, name)
				default:
					// Don't instrument unknown methods
					return fn
			}
		},
	}
	return wrap(rateLimit, rateLimitHandler)
}
