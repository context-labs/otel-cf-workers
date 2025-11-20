import { context as api_context, trace, SpanOptions, SpanKind, Exception, SpanStatusCode } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { passthroughGet, unwrap, wrap } from '../wrap.js'
import {
	getParentContextFromHeaders,
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
	instrumentClientFetch,
} from './fetch.js'
import { instrumentEnv } from './env.js'
import { Initialiser, setConfig } from '../config.js'
import { instrumentStorage } from './do-storage.js'
import { DOConstructorTrigger } from '../types.js'
import { ATTR_CLOUDFLARE_JSRPC_METHOD, ATTR_RPC_SYSTEM, ATTR_RPC_SERVICE, ATTR_RPC_METHOD } from '../constants.js'

import { DurableObject as DurableObjectClass } from 'cloudflare:workers'

type DO = DurableObject | DurableObjectClass
type FetchFn = DurableObject['fetch']
type AlarmFn = DurableObject['alarm']
type Env = Record<string, unknown>

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

			const spanName = `RPC ${nsName}.${methodName}`

			return tracer.startActiveSpan(spanName, options, async (span) => {
				try {
					const result = await Reflect.apply(target, thisArg, argArray)
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

export function instrumentDOBinding(ns: DurableObjectNamespace, nsName: string) {
	const nsHandler: ProxyHandler<typeof ns> = {
		get(target, prop, receiver) {
			if (prop === 'get') {
				const fn = Reflect.get(ns, prop, receiver)
				return instrumentBindingGet(fn, nsName)
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
			const context = setConfig(config)

			const tracer = trace.getTracer('do_rpc_handler')
			const doName = id.name || id.toString()

			const executeRpc = async () => {
				const attributes = {
					[ATTR_RPC_SYSTEM]: 'cloudflare_rpc',
					[ATTR_RPC_METHOD]: methodName,
					[ATTR_CLOUDFLARE_JSRPC_METHOD]: methodName,
					[SemanticAttributes.FAAS_TRIGGER]: 'rpc',
					'do.id': id.toString(),
					'do.name': id.name,
				}

				const options: SpanOptions = {
					kind: SpanKind.SERVER,
					attributes,
				}

				const spanName = `Durable Object RPC ${doName}.${methodName}`

				return tracer.startActiveSpan(spanName, options, async (span) => {
					try {
						const bound = target.bind(thisArg)
						const result = await bound.apply(thisArg, argArray)
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

function instrumentDurableObject(
	doObj: DO,
	initialiser: Initialiser,
	env: Env,
	state: DurableObjectState,
	classStyle: boolean,
) {
	const objHandler: ProxyHandler<DurableObject> = {
		get(target, prop) {
			if (classStyle && prop === 'ctx') {
				return state
			} else if (classStyle && prop === 'env') {
				return env
			} else if (prop === 'fetch') {
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
			const classStyle = doClass.prototype instanceof DurableObjectClass
			const createDO = () => {
				if (classStyle) {
					return new target(orig_state, orig_env)
				} else {
					return new target(state, env)
				}
			}
			const doObj = api_context.with(context, createDO)

			return instrumentDurableObject(doObj, initialiser, env, state, classStyle)
		},
	}
	return wrap(doClass, classHandler)
}
