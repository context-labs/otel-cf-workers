import { context as api_context, Exception, propagation, SpanStatusCode, trace } from '@opentelemetry/api'
import { Resource, resourceFromAttributes } from '@opentelemetry/resources'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

import { Initialiser, parseConfig, setConfig, ResolvedConfig } from './config.js'
import { WorkerTracerProvider } from './provider.js'
import { Trigger, OrPromise, HandlerInstrumentation, ConfigurationOption } from './types.js'
import { WorkerLoggerProvider } from './logs/provider.js'
import { unwrap } from './wrap.js'
import { WorkerTracer } from './tracer.js'

import { fetchInstrumentation, instrumentGlobalFetch } from './instrumentation/fetch.js'
import { instrumentGlobalCache } from './instrumentation/cache.js'
import { QueueInstrumentation } from './instrumentation/queue.js'
import { DOClass, instrumentDOClass } from './instrumentation/do.js'
import { scheduledInstrumentation } from './instrumentation/scheduled.js'
import { instrumentEnv } from './instrumentation/env.js'
import { versionAttributes } from './instrumentation/version.js'
import { PromiseTracker, proxyExecutionContext } from './instrumentation/common.js'
import { emailInstrumentation } from './instrumentation/email.js'
import { PACKAGE_VERSION } from './constants.js'
import { env } from 'cloudflare:workers'

type FetchHandler = ExportedHandlerFetchHandler<unknown, unknown>
type ScheduledHandler = ExportedHandlerScheduledHandler<unknown>
type QueueHandler = ExportedHandlerQueueHandler
type EmailHandler = EmailExportedHandler

type Env = Record<string, any>
type HandlerFn<T extends Trigger, E extends Env, R extends any> = (
	trigger: T,
	env: E,
	ctx: ExecutionContext,
) => R | Promise<R>

export function isRequest(trigger: Trigger): trigger is Request {
	return trigger instanceof Request
}

export function isMessageBatch(trigger: Trigger): trigger is MessageBatch {
	return !!(trigger as MessageBatch).ackAll
}

export function isAlarm(trigger: Trigger): trigger is 'do-alarm' {
	return trigger === 'do-alarm'
}

function findVersionMeta(): WorkerVersionMetadata | undefined {
	return Object.values(env).find((binding: any) => {
		return (
			Object.getPrototypeOf(binding).constructor.name === 'Object' &&
			binding.id !== undefined &&
			binding.tag !== undefined
		)
	})
}

const createResource = (serviceConfig: any, versionMeta?: WorkerVersionMetadata): Resource => {
	console.log({ versionMeta })
	const workerResourceAttrs = {
		'cloud.provider': 'cloudflare',
		'cloud.platform': 'cloudflare.workers',
		'cloud.region': 'earth',
		'faas.max_memory': 134217728,
		'telemetry.sdk.language': 'js',
		'telemetry.sdk.name': '@inference-net/otel-cf-workers',
		'telemetry.sdk.version': PACKAGE_VERSION,
		'cf.worker.version.id': versionMeta?.id,
		'cf.worker.version.tag': versionMeta?.tag,
		'cf.worker.version.timestamp': versionMeta?.timestamp,
	}
	const serviceResource = resourceFromAttributes({
		'service.name': serviceConfig.name,
		'service.namespace': serviceConfig.namespace,
		'service.version': serviceConfig.version,
	})
	const resource = resourceFromAttributes(workerResourceAttrs)
	return resource.merge(serviceResource)
}

let initialised = false
function init(config: ResolvedConfig, serviceConfig: any, propagator: any): void {
	if (!initialised) {
		const resource = createResource(serviceConfig, findVersionMeta())

		// Initialize traces if configured
		if (config.trace) {
			if (config.trace.instrumentation.instrumentGlobalCache) {
				instrumentGlobalCache()
			}
			if (config.trace.instrumentation.instrumentGlobalFetch) {
				instrumentGlobalFetch()
			}

			const traceProvider = new WorkerTracerProvider(config.trace.spanProcessors, resource)
			traceProvider.register()
		}

		// Initialize logs if configured
		if (config.logs && config.logs.processors.length > 0) {
			const logsProvider = new WorkerLoggerProvider(config.logs.processors, resource, config.logs.level)
			logsProvider.register()

			// Instrument console if enabled
			if (config.logs.instrumentation.instrumentConsole) {
				import('./logs/console.js').then(({ instrumentConsole }) => {
					instrumentConsole()
				})
			}
		}

		// Set global propagator
		propagation.setGlobalPropagator(propagator)

		initialised = true
	}
}

function createInitialiser(config: ConfigurationOption): Initialiser {
	if (typeof config === 'function') {
		return (env, trigger) => {
			const userConfig = config(env, trigger)
			const conf = parseConfig(userConfig)
			const propagator = userConfig.propagator || new W3CTraceContextPropagator()
			init(conf, userConfig.service, propagator)
			return conf
		}
	} else {
		return () => {
			const conf = parseConfig(config)
			const propagator = config.propagator || new W3CTraceContextPropagator()
			init(conf, config.service, propagator)
			return conf
		}
	}
}

export async function exportTelemetry(traceId: string, tracker?: PromiseTracker) {
	const tracer = trace.getTracer('export')
	const { getLogger } = await import('./logs/provider.js')
	const logger = getLogger('export')

	// Export traces
	if (tracer instanceof WorkerTracer) {
		await scheduler.wait(1)
		await tracker?.wait()
		await tracer.forceFlush(traceId)
	}

	// Export logs
	if (logger && typeof logger.forceFlush === 'function') {
		await logger.forceFlush()
	}
}

// Backward compatibility
export const exportSpans = exportTelemetry

type HandlerFnArgs<T extends Trigger, E extends Env> = (T | E | ExecutionContext)[]
type OrderedHandlerFnArgs<T extends Trigger, E extends Env> = [trigger: T, env: E, ctx: ExecutionContext]

let cold_start = true
function createHandlerFlowFn<T extends Trigger, E extends Env, R extends any>(
	instrumentation: HandlerInstrumentation<T, R>,
): (handlerFn: HandlerFn<T, E, R>, [trigger, env, context]: HandlerFnArgs<T, E>) => ReturnType<HandlerFn<T, E, R>> {
	return (handlerFn, args) => {
		const [trigger, env, context] = args as OrderedHandlerFnArgs<T, E>
		const proxiedEnv = instrumentEnv(env)
		const { ctx: proxiedCtx, tracker } = proxyExecutionContext(context)

		const instrumentedTrigger = instrumentation.instrumentTrigger ? instrumentation.instrumentTrigger(trigger) : trigger

		const tracer = trace.getTracer('handler') as WorkerTracer

		const { name, options, context: spanContext } = instrumentation.getInitialSpanInfo(trigger)
		const attrs = options.attributes || {}
		attrs['faas.coldstart'] = cold_start
		options.attributes = attrs
		Object.assign(attrs, versionAttributes(env))
		cold_start = false

		const parentContext = spanContext || api_context.active()
		const result = tracer.startActiveSpan(name, options, parentContext, async (span) => {
			try {
				const result = await handlerFn(instrumentedTrigger, proxiedEnv, proxiedCtx)

				if (instrumentation.getAttributesFromResult) {
					const attributes = instrumentation.getAttributesFromResult(result)
					span.setAttributes(attributes)
				}

				if (instrumentation.executionSucces) {
					instrumentation.executionSucces(span, trigger, result)
				}
				return result
			} catch (error) {
				span.recordException(error as Exception)
				span.setStatus({ code: SpanStatusCode.ERROR })
				if (instrumentation.executionFailed) {
					instrumentation.executionFailed(span, trigger, error)
				}
				throw error
			} finally {
				span.end()
				context.waitUntil(exportTelemetry(span.spanContext().traceId, tracker))
			}
		})

		return result
	}
}

function createHandlerProxy<T extends Trigger, E extends Env, R extends OrPromise<any>>(
	handler: unknown,
	handlerFn: HandlerFn<T, E, R>,
	initialiser: Initialiser,
	instrumentation: HandlerInstrumentation<T, R>,
): HandlerFn<T, E, R> {
	return (trigger: T, env: E, ctx: ExecutionContext): ReturnType<HandlerFn<T, E, R>> => {
		const config = initialiser(env, trigger)
		const context = setConfig(config)

		const flowFn = createHandlerFlowFn<T, E, R>(instrumentation)
		return api_context.with(context, flowFn, handler, handlerFn, [trigger, env, ctx]) as R
	}
}

export function instrument<E extends Env, Q, C>(
	handler: ExportedHandler<E, Q, C>,
	config: ConfigurationOption,
): ExportedHandler<E, Q, C> {
	const initialiser = createInitialiser(config)

	if (handler.fetch) {
		const fetcher = unwrap(handler.fetch) as FetchHandler
		handler.fetch = createHandlerProxy(handler, fetcher, initialiser, fetchInstrumentation)
	}

	if (handler.scheduled) {
		const scheduler = unwrap(handler.scheduled) as ScheduledHandler
		handler.scheduled = createHandlerProxy(handler, scheduler, initialiser, scheduledInstrumentation)
	}

	if (handler.queue) {
		const queuer = unwrap(handler.queue) as QueueHandler
		handler.queue = createHandlerProxy(handler, queuer, initialiser, new QueueInstrumentation())
	}

	if (handler.email) {
		const emailer = unwrap(handler.email) as EmailHandler
		handler.email = createHandlerProxy(handler, emailer, initialiser, emailInstrumentation)
	}

	return handler
}

export function instrumentDO(doClass: DOClass, config: ConfigurationOption) {
	const initialiser = createInitialiser(config)

	return instrumentDOClass(doClass, initialiser)
}

export const __unwrappedFetch = unwrap(fetch)
