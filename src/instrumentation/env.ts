import { isProxyable, wrap } from '../wrap'
import { instrumentDOBinding } from './do'
import { instrumentKV } from './kv'
import { instrumentQueueSender } from './queue'
import { instrumentServiceBinding } from './service'
import { instrumentD1 } from './d1'
import { instrumentAnalyticsEngineDataset } from './analytics-engine'
import { instrumentR2Bucket } from './r2'
import { instrumentImagesBinding } from './images'
import { instrumentRateLimitBinding } from './rate-limit'

const isJSRPC = (item?: unknown): item is Service => {
	// @ts-expect-error The point of RPC types is to block non-existent properties, but that's the goal here
	return !!(item as Service)?.['__some_property_that_will_never_exist' + Math.random()]
}

const isKVNamespace = (item?: unknown): item is KVNamespace => {
	return !isJSRPC(item) && !!(item as KVNamespace)?.getWithMetadata
}

const isQueue = (item?: unknown): item is Queue<unknown> => {
	return !isJSRPC(item) && !!(item as Queue<unknown>)?.sendBatch
}

const isDurableObject = (item?: unknown): item is DurableObjectNamespace => {
	return !isJSRPC(item) && !!(item as DurableObjectNamespace)?.idFromName
}

export const isVersionMetadata = (item?: unknown): item is WorkerVersionMetadata => {
	return (
		!isJSRPC(item) &&
		typeof (item as WorkerVersionMetadata)?.id === 'string' &&
		typeof (item as WorkerVersionMetadata)?.tag === 'string'
	)
}

const isAnalyticsEngineDataset = (item?: unknown): item is AnalyticsEngineDataset => {
	return !isJSRPC(item) && !!(item as AnalyticsEngineDataset)?.writeDataPoint
}

const isD1Database = (item?: unknown): item is D1Database => {
	return !!(item as D1Database)?.exec && !!(item as D1Database)?.prepare
}

const isR2Bucket = (item?: unknown): item is R2Bucket => {
	return !isJSRPC(item) && !!(item as R2Bucket)?.head && !!(item as R2Bucket)?.list
}

const isImagesBinding = (item?: unknown): boolean => {
	// Images binding detection - has get, list, delete methods
	// Note: Using generic detection since Images binding isn't in @cloudflare/workers-types yet
	const obj = item as any
	return (
		!isJSRPC(item) &&
		typeof obj?.get === 'function' &&
		typeof obj?.list === 'function' &&
		typeof obj?.delete === 'function' &&
		// Distinguish from other bindings with similar methods
		!isR2Bucket(item) &&
		!isKVNamespace(item)
	)
}

const isRateLimitBinding = (item?: unknown): boolean => {
	// Rate Limiting binding detection - has limit method
	const obj = item as any
	return !isJSRPC(item) && typeof obj?.limit === 'function' && !isDurableObject(item)
}

const instrumentEnv = <E extends Record<string, unknown>>(env: E): E => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (!isProxyable(item)) {
				return item
			}
			if (isJSRPC(item)) {
				return instrumentServiceBinding(item, String(prop))
			} else if (isKVNamespace(item)) {
				return instrumentKV(item, String(prop))
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isDurableObject(item)) {
				return instrumentDOBinding(item, String(prop))
			} else if (isVersionMetadata(item)) {
				// we do not need to log accesses to the metadata
				return item
			} else if (isAnalyticsEngineDataset(item)) {
				return instrumentAnalyticsEngineDataset(item, String(prop))
			} else if (isD1Database(item)) {
				return instrumentD1(item, String(prop))
			} else if (isR2Bucket(item)) {
				return instrumentR2Bucket(item, String(prop))
			} else if (isImagesBinding(item)) {
				return instrumentImagesBinding(item as any, String(prop))
			} else if (isRateLimitBinding(item)) {
				return instrumentRateLimitBinding(item as any, String(prop))
			} else {
				return item
			}
		},
	}
	return wrap(env, envHandler) as E
}

export { instrumentEnv }
