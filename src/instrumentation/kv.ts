import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap'
import {
	ATTR_CLOUDFLARE_BINDING_TYPE,
	ATTR_CLOUDFLARE_BINDING_NAME,
	ATTR_DB_SYSTEM_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_CLOUDFLARE_KV_QUERY_KEYS,
	ATTR_CLOUDFLARE_KV_QUERY_KEYS_COUNT,
	ATTR_CLOUDFLARE_KV_QUERY_TYPE,
	ATTR_CLOUDFLARE_KV_QUERY_CACHE_TTL,
	ATTR_CLOUDFLARE_KV_QUERY_VALUE_TYPE,
	ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION,
	ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION_TTL,
	ATTR_CLOUDFLARE_KV_QUERY_METADATA,
	ATTR_CLOUDFLARE_KV_QUERY_PREFIX,
	ATTR_CLOUDFLARE_KV_QUERY_LIMIT,
	ATTR_CLOUDFLARE_KV_QUERY_CURSOR,
	ATTR_CLOUDFLARE_KV_RESPONSE_CACHE_STATUS,
	ATTR_CLOUDFLARE_KV_RESPONSE_LIST_COMPLETE,
	ATTR_CLOUDFLARE_KV_RESPONSE_CURSOR,
	ATTR_CLOUDFLARE_KV_RESPONSE_METADATA,
} from '../constants'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare KV'

const KVAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(_argArray) {
		return {}
	},
	get(argArray) {
		const attrs: Attributes = {}
		const opts = argArray[1]
		if (typeof opts === 'string') {
			attrs[ATTR_CLOUDFLARE_KV_QUERY_TYPE] = opts
		} else if (typeof opts === 'object') {
			if (opts.type) attrs[ATTR_CLOUDFLARE_KV_QUERY_TYPE] = opts.type
			if (opts.cacheTtl) attrs[ATTR_CLOUDFLARE_KV_QUERY_CACHE_TTL] = opts.cacheTtl
		}
		return attrs
	},
	getWithMetadata(argArray, result) {
		const attrs: Attributes = {}
		const opts = argArray[1]
		if (typeof opts === 'string') {
			attrs[ATTR_CLOUDFLARE_KV_QUERY_TYPE] = opts
		} else if (typeof opts === 'object') {
			if (opts.type) attrs[ATTR_CLOUDFLARE_KV_QUERY_TYPE] = opts.type
			if (opts.cacheTtl) attrs[ATTR_CLOUDFLARE_KV_QUERY_CACHE_TTL] = opts.cacheTtl
		}

		const kvResult = result as KVNamespaceGetWithMetadataResult<any, any>
		if (kvResult.metadata !== null && kvResult.metadata !== undefined) {
			attrs[ATTR_CLOUDFLARE_KV_RESPONSE_METADATA] = JSON.stringify(kvResult.metadata)
		}
		if (kvResult.cacheStatus) {
			attrs[ATTR_CLOUDFLARE_KV_RESPONSE_CACHE_STATUS] = kvResult.cacheStatus
		}
		return attrs
	},
	list(argArray, result) {
		const attrs: Attributes = {}
		const opts: KVNamespaceListOptions = argArray[0] || {}
		if (opts.cursor) attrs[ATTR_CLOUDFLARE_KV_QUERY_CURSOR] = opts.cursor
		if (opts.limit) attrs[ATTR_CLOUDFLARE_KV_QUERY_LIMIT] = opts.limit
		if (opts.prefix) attrs[ATTR_CLOUDFLARE_KV_QUERY_PREFIX] = opts.prefix

		const kvResult = result as KVNamespaceListResult<any, any>
		attrs[ATTR_CLOUDFLARE_KV_RESPONSE_LIST_COMPLETE] = kvResult.list_complete
		if (!kvResult.list_complete && kvResult.cursor) {
			attrs[ATTR_CLOUDFLARE_KV_RESPONSE_CURSOR] = kvResult.cursor
		}
		if (kvResult.cacheStatus) {
			attrs[ATTR_CLOUDFLARE_KV_RESPONSE_CACHE_STATUS] = kvResult.cacheStatus
		}
		return attrs
	},
	put(argArray) {
		const attrs: Attributes = {}
		const value = argArray[1]
		if (value !== undefined) {
			attrs[ATTR_CLOUDFLARE_KV_QUERY_VALUE_TYPE] = typeof value
		}
		if (argArray.length > 2 && argArray[2]) {
			const options = argArray[2] as KVNamespacePutOptions
			if (options.expiration) attrs[ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION] = options.expiration
			if (options.expirationTtl) attrs[ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION_TTL] = options.expirationTtl
			if (options.metadata !== undefined) {
				attrs[ATTR_CLOUDFLARE_KV_QUERY_METADATA] = JSON.stringify(options.metadata)
			}
		}
		return attrs
	},
}

function instrumentKVFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('KV')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'KV',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[SemanticAttributes.DB_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: operation,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`KV ${name} ${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = KVAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)

				// Add key/keys attributes
				if (operation === 'list') {
					// No specific key for list operations
				} else if (Array.isArray(argArray[0])) {
					// Multi-key operation
					const keys = argArray[0] as string[]
					if (keys.length > 0 && keys[0]) {
						span.setAttribute(ATTR_CLOUDFLARE_KV_QUERY_KEYS, keys[0])
						span.setAttribute(ATTR_CLOUDFLARE_KV_QUERY_KEYS_COUNT, keys.length)
					}
				} else if (argArray[0] && typeof argArray[0] === 'string') {
					// Single key operation
					span.setAttribute(ATTR_CLOUDFLARE_KV_QUERY_KEYS, argArray[0])
					span.setAttribute(ATTR_CLOUDFLARE_KV_QUERY_KEYS_COUNT, 1)
				}

				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentKV(kv: KVNamespace, name: string): KVNamespace {
	const kvHandler: ProxyHandler<KVNamespace> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentKVFn(fn, name, operation)
		},
	}
	return wrap(kv, kvHandler)
}
