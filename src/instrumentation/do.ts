import { context as api_context, trace, SpanOptions, SpanKind, Exception, SpanStatusCode } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { passthroughGet, unwrap, wrap } from '../wrap'
import {
	getParentContextFromHeaders,
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
	instrumentClientFetch,
} from './fetch'
import { instrumentEnv } from './env'
import { getActiveConfig, Initialiser, setConfig } from '../config'
import { instrumentStorage } from './do-storage'
import { DOConstructorTrigger } from '../types'
import { ATTR_CLOUDFLARE_JSRPC_METHOD, ATTR_RPC_SYSTEM, ATTR_RPC_SERVICE, ATTR_RPC_METHOD } from '../constants'
import { injectRpcContext, extractAndRemoveRpcContext } from './rpc-context'

import { DurableObject as DurableObjectClass } from 'cloudflare:workers'

type DO = DurableObject | DurableObjectClass
type FetchFn = DurableObject['fetch']
type AlarmFn = DurableObject['alarm']
type Env = Record<string, unknown>

export interface InstrumentOptions extends Omit<SpanOptions, 'kind'> {
	// Any standard SpanOptions (attributes, links, etc.)
}

export type InstrumentMethod = {
	<T>(name: string, fn: () => Promise<T>): Promise<T>
	<T>(name: string, options: InstrumentOptions, fn: () => Promise<T>): Promise<T>
}

/**
 * Base class for instrumented Durable Objects with TypeScript support for injected methods.
 * Extend this instead of DurableObject to automatically get typing for `this.instrument()`.
 *
 * @example
 * ```typescript
 * import { InstrumentedDurableObject } from '@inference-net/otel-cf-workers'
 *
 * export class MyDO extends InstrumentedDurableObject<Env> {
 *   async someMethod() {
 *     // this.instrument is available with full TypeScript support!
 *     await this.instrument('custom-operation', async () => {
 *       // Your code here
 *     })
 *   }
 * }
 * ```
 */
export class InstrumentedDurableObject<Env = unknown> extends DurableObjectClass<Env> {
	declare instrument: InstrumentMethod
}

function createInstrumentMethod(state: DurableObjectState, initialiser: Initialiser, env: Env): InstrumentMethod {
	return async function instrument<T>(
		name: string,
		optionsOrFn: InstrumentOptions | (() => Promise<T>),
		maybeFn?: () => Promise<T>,
	): Promise<T> {
		// Parse arguments - support both forms
		const options: InstrumentOptions = typeof optionsOrFn === 'function' ? {} : optionsOrFn
		const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!

		const tracer = trace.getTracer('DO custom span')

		const spanOptions: SpanOptions = {
			...options,
			attributes: {
				'do.id': state.id.toString(),
				...(state.id.name && { 'do.name': state.id.name }),
				...options.attributes,
			},
		}

		// Ensure config is available in context
		// If already in a traced context (fetch/alarm/RPC), config will exist
		// If not, we need to initialize it
		const executeWithConfig = async () => {
			const currentContext = api_context.active()
			const existingConfig = getActiveConfig()

			let context = currentContext
			if (!existingConfig) {
				// No config in context - we're being called outside fetch/alarm/RPC
				// Initialize config for this call
				const config = initialiser(env, { id: state.id.toString(), name: state.id.name })
				context = setConfig(config, currentContext)
			}

			// Use the current active context - if we're inside fetch/alarm/RPC,
			// this will be a child span. Otherwise, it's a root span.
			return api_context.with(context, () =>
				tracer.startActiveSpan(name, spanOptions, async (span) => {
					try {
						const result = await fn()
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						span.recordException(error as Exception)
						span.setStatus({ code: SpanStatusCode.ERROR })
						throw error
					} finally {
						span.end()
					}
				}),
			)
		}

		return executeWithConfig()
	}
}

function instrumentRpcMethod(method: Function, methodName: string, nsName: string, stubId: DurableObjectId): Function {
	const tracer = trace.getTracer('do_rpc_client')

	const rpcHandler: ProxyHandler<Function> = {
		apply: async (target, thisArg, argArray) => {
			const attributes = {
				[ATTR_RPC_SYSTEM]: 'cloudflare_rpc',
				[ATTR_RPC_SERVICE]: nsName,
				[ATTR_RPC_METHOD]: methodName,
				[ATTR_CLOUDFLARE_JSRPC_METHOD]: methodName,
				'do.namespace': nsName,
				'do.id': stubId.toString(),
				'do.id.name': stubId.name,
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}

			// Use DO name if available, otherwise namespace
			const serviceName = stubId.name || nsName
			const spanName = `RPC ${serviceName}.${methodName}`

			return tracer.startActiveSpan(spanName, options, async (span) => {
				try {
					// Inject trace context as first argument, including DO name if available
					const contextCarrier = injectRpcContext(api_context.active(), stubId.name)
					const argsWithContext = [contextCarrier, ...argArray]

					const result = await Reflect.apply(target, thisArg, argsWithContext)
					span.setStatus({ code: SpanStatusCode.OK })
					return result
				} catch (error) {
					span.recordException(error as Exception)
					span.setStatus({ code: SpanStatusCode.ERROR })
					throw error
				} finally {
					span.end()
				}
			})
		},
	}

	return wrap(method, rpcHandler)
}

function instrumentBindingStub(stub: DurableObjectStub, nsName: string): DurableObjectStub {
	const stubHandler: ProxyHandler<typeof stub> = {
		get(target, prop, receiver) {
			if (prop === 'fetch') {
				const fetcher = Reflect.get(target, prop)
				const attrs = {
					name: `Durable Object ${nsName}`,
					'do.namespace': nsName,
					'do.id': target.id.toString(),
					'do.id.name': target.id.name,
				}
				return instrumentClientFetch(fetcher, () => ({ includeTraceContext: true }), attrs)
			} else {
				// Get the property value
				const value = passthroughGet(target, prop, receiver)

				// Check if it's an RPC method (function from the DO class)
				if (typeof value === 'function' && typeof prop === 'string') {
					// Instrument RPC method calls
					return instrumentRpcMethod(value, prop, nsName, target.id)
				}

				return value
			}
		},
	}
	return wrap(stub, stubHandler)
}

function instrumentBindingGet(getFn: DurableObjectNamespace['get'], nsName: string): DurableObjectNamespace['get'] {
	const getHandler: ProxyHandler<DurableObjectNamespace['get']> = {
		apply(target, thisArg, argArray) {
			const stub: DurableObjectStub = Reflect.apply(target, thisArg, argArray)
			return instrumentBindingStub(stub, nsName)
		},
	}
	return wrap(getFn, getHandler)
}

// getByName is just a convenience wrapper that calls idFromName + get
// We still need to instrument it to capture the stub
function instrumentBindingGetByName(
	getByNameFn: DurableObjectNamespace['getByName'],
	nsName: string,
): DurableObjectNamespace['getByName'] {
	const getByNameHandler: ProxyHandler<DurableObjectNamespace['getByName']> = {
		apply(target, thisArg, argArray) {
			const stub: DurableObjectStub = Reflect.apply(target, thisArg, argArray)
			// The name passed to getByName should be available on stub.id.name
			// but we'll also track it ourselves to be safe
			return instrumentBindingStub(stub, nsName)
		},
	}
	return wrap(getByNameFn, getByNameHandler)
}

export function instrumentDOBinding(ns: DurableObjectNamespace, nsName: string) {
	const nsHandler: ProxyHandler<typeof ns> = {
		get(target, prop, receiver) {
			if (prop === 'get') {
				const fn = Reflect.get(ns, prop, receiver)
				return instrumentBindingGet(fn, nsName)
			} else if (prop === 'getByName') {
				const fn = Reflect.get(ns, prop, receiver)
				return instrumentBindingGetByName(fn, nsName)
			} else {
				return passthroughGet(target, prop, receiver)
			}
		},
	}
	return wrap(ns, nsHandler)
}

export function instrumentState(state: DurableObjectState) {
	const stateHandler: ProxyHandler<DurableObjectState> = {
		get(target, prop, receiver) {
			const result = Reflect.get(target, prop, unwrap(receiver))
			if (prop === 'storage') {
				return instrumentStorage(result)
			} else if (typeof result === 'function') {
				return result.bind(target)
			} else {
				return result
			}
		},
	}
	return wrap(state, stateHandler)
}

let cold_start = true
export function executeDOFetch(fetchFn: FetchFn, request: Request, id: DurableObjectId): Promise<Response> {
	const spanContext = getParentContextFromHeaders(request.headers)

	const tracer = trace.getTracer('DO fetchHandler')
	const attributes = {
		[SemanticAttributes.FAAS_TRIGGER]: 'http',
		[SemanticAttributes.FAAS_COLDSTART]: cold_start,
	}
	cold_start = false
	Object.assign(attributes, gatherRequestAttributes(request))
	Object.assign(attributes, gatherIncomingCfAttributes(request))
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const name = id.name || ''
	const promise = tracer.startActiveSpan(`Durable Object Fetch ${name}`, options, spanContext, async (span) => {
		try {
			const response: Response = await fetchFn(request)
			if (response.ok) {
				span.setStatus({ code: SpanStatusCode.OK })
			}
			span.setAttributes(gatherResponseAttributes(response))
			span.end()

			return response
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
		}
	})
	return promise
}

export function executeDOAlarm(alarmFn: NonNullable<AlarmFn>, id: DurableObjectId): Promise<void> {
	const tracer = trace.getTracer('DO alarmHandler')

	const name = id.name || ''
	const promise = tracer.startActiveSpan(`Durable Object Alarm ${name}`, async (span) => {
		span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start)
		cold_start = false
		span.setAttribute('do.id', id.toString())
		if (id.name) span.setAttribute('do.name', id.name)

		try {
			await alarmFn()
			span.end()
		} catch (error) {
			span.recordException(error as Exception)
			span.setStatus({ code: SpanStatusCode.ERROR })
			span.end()
			throw error
		}
	})
	return promise
}

function instrumentFetchFn(fetchFn: FetchFn, initialiser: Initialiser, env: Env, id: DurableObjectId): FetchFn {
	const fetchHandler: ProxyHandler<FetchFn> = {
		async apply(target, thisArg, argArray: Parameters<FetchFn>) {
			const request = argArray[0]
			const config = initialiser(env, request)
			const context = setConfig(config)
			try {
				const bound = target.bind(unwrap(thisArg))
				return await api_context.with(context, executeDOFetch, undefined, bound, request, id)
			} catch (error) {
				throw error
			}
		},
	}
	return wrap(fetchFn, fetchHandler)
}

function instrumentAlarmFn(alarmFn: AlarmFn, initialiser: Initialiser, env: Env, id: DurableObjectId) {
	if (!alarmFn) return undefined

	const alarmHandler: ProxyHandler<NonNullable<AlarmFn>> = {
		async apply(target, thisArg) {
			const config = initialiser(env, 'do-alarm')
			const context = setConfig(config)
			try {
				const bound = target.bind(unwrap(thisArg))
				return await api_context.with(context, executeDOAlarm, undefined, bound, id)
			} catch (error) {
				throw error
			}
		},
	}
	return wrap(alarmFn, alarmHandler)
}

function instrumentRpcHandlerMethod(
	fn: Function,
	methodName: string,
	initialiser: Initialiser,
	env: Env,
	id: DurableObjectId,
): Function {
	if (!fn) return fn

	const fnHandler: ProxyHandler<Function> = {
		async apply(target, thisArg, argArray) {
			thisArg = unwrap(thisArg)
			const config = initialiser(env, 'do-rpc')

			// Extract and remove RPC context carrier from arguments
			const [extractedContext, cleanedArgs] = extractAndRemoveRpcContext(argArray)

			// Get DO name from carrier if available, fall back to id.name
			const carrierDoName = argArray.length > 0 && extractedContext ? (argArray[0] as any).doName : undefined
			const doName = carrierDoName || id.name || undefined

			// Build the context: start with extracted parent context (if any), then add config
			let context = extractedContext || api_context.active()
			context = setConfig(config, context)

			const tracer = trace.getTracer('do_rpc_handler')

			const executeRpc = async () => {
				const attributes: Record<string, string> = {
					[ATTR_RPC_SYSTEM]: 'cloudflare_rpc',
					[ATTR_RPC_METHOD]: methodName,
					[ATTR_CLOUDFLARE_JSRPC_METHOD]: methodName,
					[SemanticAttributes.FAAS_TRIGGER]: 'rpc',
					'do.id': id.toString(),
				}

				if (doName) {
					attributes['do.name'] = doName
				}

				const options: SpanOptions = {
					kind: SpanKind.SERVER,
					attributes,
				}

				const spanName = doName ? `${doName}.${methodName}` : `${attributes['do.id']}.${methodName}`

				// Use the current context (which includes extracted parent) for the span
				return tracer.startActiveSpan(spanName, options, api_context.active(), async (span) => {
					try {
						const bound = target.bind(thisArg)
						// Use cleaned args (without context carrier) for the actual method call
						const result = await bound.apply(thisArg, cleanedArgs)
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						span.recordException(error as Exception)
						span.setStatus({ code: SpanStatusCode.ERROR })
						throw error
					} finally {
						span.end()
					}
				})
			}

			return await api_context.with(context, executeRpc)
		},
	}
	return wrap(fn, fnHandler)
}

function instrumentDurableObject(doObj: DO, initialiser: Initialiser, env: Env, state: DurableObjectState) {
	const objHandler: ProxyHandler<DurableObject> = {
		get(target, prop) {
			// instrument, env, and ctx are now real properties, so this won't be called for them
			// This proxy mainly handles fetch, alarm, and RPC method wrapping
			if (prop === 'fetch') {
				const fetchFn = Reflect.get(target, prop)
				return instrumentFetchFn(fetchFn, initialiser, env, state.id)
			} else if (prop === 'alarm') {
				const alarmFn = Reflect.get(target, prop)
				return instrumentAlarmFn(alarmFn, initialiser, env, state.id)
			} else {
				const result = Reflect.get(target, prop)
				if (typeof result === 'function' && typeof prop === 'string') {
					result.bind(doObj)
					// Instrument as RPC handler method (server-side)
					return instrumentRpcHandlerMethod(result, prop, initialiser, env, state.id)
				}
				return result
			}
		},
	}
	return wrap(doObj, objHandler)
}

export type DOClass = { new (state: DurableObjectState, env: any): DO }

export function instrumentDOClass<C extends DOClass>(doClass: C, initialiser: Initialiser): C {
	const classHandler: ProxyHandler<C> = {
		construct(target, [orig_state, orig_env]: ConstructorParameters<DOClass>) {
			const trigger: DOConstructorTrigger = {
				id: orig_state.id.toString(),
				name: orig_state.id.name,
			}
			const constructorConfig = initialiser(orig_env, trigger)
			const context = setConfig(constructorConfig)
			const state = instrumentState(orig_state)
			const env = instrumentEnv(orig_env)

			// Always pass original state/env to constructor
			// The DurableObject base class (if extends DurableObject) expects the real types
			const createDO = () => new target(orig_state, orig_env)
			const doObj = api_context.with(context, createDO)

			// Always inject instrumented versions as real properties
			// This works for both class-style and legacy DOs, and avoids proxy issues
			const instrumentMethod = createInstrumentMethod(state, initialiser, env)

			Object.defineProperty(doObj, 'instrument', {
				value: instrumentMethod,
				writable: false,
				enumerable: false,
				configurable: true,
			})

			Object.defineProperty(doObj, 'env', {
				value: env,
				writable: false,
				enumerable: true,
				configurable: true,
			})

			Object.defineProperty(doObj, 'ctx', {
				value: state,
				writable: false,
				enumerable: true,
				configurable: true,
			})

			return instrumentDurableObject(doObj, initialiser, env, state)
		},
	}
	return wrap(doClass, classHandler)
}
