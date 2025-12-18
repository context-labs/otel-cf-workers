import { context } from '@opentelemetry/api'
import {
	ExporterConfig,
	isSpanProcessorConfig,
	ParentRatioSamplingConfig,
	ResolvedTraceConfig,
	TraceConfig,
	Trigger,
	WorkerOtelConfig,
	ResolvedLogsConfig,
	LogsConfig,
} from './types'
import { ReadableSpan, Sampler, SpanExporter } from '@opentelemetry/sdk-trace-base'

import { OTLPExporter } from './exporter'
import { multiTailSampler, isHeadSampled, isRootErrorSpan, createSampler } from './sampling'
import { BatchTraceSpanProcessor } from './spanprocessor'
import { MultiTransportLogRecordProcessor } from './logs/logprocessor'

const traceConfigSymbol = Symbol('Otel Workers Tracing Configuration')
const logsConfigSymbol = Symbol('Otel Workers Logs Configuration')

export interface ResolvedConfig {
	trace?: ResolvedTraceConfig
	logs?: ResolvedLogsConfig
}

export type Initialiser = (env: Record<string, unknown>, trigger: Trigger) => ResolvedConfig

export function setConfig(config: ResolvedConfig, ctx = context.active()) {
	let newCtx = ctx
	if (config.trace) {
		newCtx = newCtx.setValue(traceConfigSymbol, config.trace)
	}
	if (config.logs) {
		newCtx = newCtx.setValue(logsConfigSymbol, config.logs)
	}
	return newCtx
}

export function getActiveConfig(): ResolvedTraceConfig | undefined {
	const config = context.active().getValue(traceConfigSymbol) as ResolvedTraceConfig
	return config || undefined
}

export function getActiveLogsConfig(): ResolvedLogsConfig | undefined {
	const config = context.active().getValue(logsConfigSymbol) as ResolvedLogsConfig
	return config || undefined
}

function isSpanExporter(exporterConfig: ExporterConfig): exporterConfig is SpanExporter {
	return !!(exporterConfig as SpanExporter).export
}

function isSampler(sampler: Sampler | ParentRatioSamplingConfig): sampler is Sampler {
	return !!(sampler as Sampler).shouldSample
}

export function parseConfig(supplied: WorkerOtelConfig): ResolvedConfig {
	const config: ResolvedConfig = {}

	// Parse trace config if provided
	if (supplied.trace) {
		config.trace = parseTraceConfig(supplied.trace, supplied.propagator)
	}

	// Parse logs config if provided
	if (supplied.logs) {
		config.logs = parseLogsConfig(supplied.logs)
	}

	return config
}

function parseTraceConfig(supplied: TraceConfig, propagator?: any): ResolvedTraceConfig {
	if (isSpanProcessorConfig(supplied)) {
		const headSampleConf = supplied.sampling?.headSampler || { ratio: 1 }
		const headSampler = isSampler(headSampleConf) ? headSampleConf : createSampler(headSampleConf)
		const spanProcessors = Array.isArray(supplied.spanProcessors) ? supplied.spanProcessors : [supplied.spanProcessors]
		if (spanProcessors.length === 0) {
			console.log(
				'Warning! You must either specify an exporter or your own SpanProcessor(s)/Exporter combination in the open-telemetry configuration.',
			)
		}
		return {
			fetch: {
				includeTraceContext: supplied.fetch?.includeTraceContext ?? true,
			},
			handlers: {
				fetch: {
					acceptTraceContext: supplied.handlers?.fetch?.acceptTraceContext ?? true,
				},
			},
			postProcessor: supplied.postProcessor || ((spans: ReadableSpan[]) => spans),
			sampling: {
				headSampler,
				tailSampler: supplied.sampling?.tailSampler || multiTailSampler([isHeadSampled, isRootErrorSpan]),
			},
			spanProcessors,
			instrumentation: {
				instrumentGlobalCache: supplied.instrumentation?.instrumentGlobalCache ?? true,
				instrumentGlobalFetch: supplied.instrumentation?.instrumentGlobalFetch ?? true,
			},
			batching: {
				strategy: supplied.batching?.strategy ?? 'trace',
				maxQueueSize: supplied.batching?.maxQueueSize,
				maxExportBatchSize: supplied.batching?.maxExportBatchSize,
			},
		}
	} else {
		const exporter = isSpanExporter(supplied.exporter) ? supplied.exporter : new OTLPExporter(supplied.exporter)
		const spanProcessors = [new BatchTraceSpanProcessor(exporter)]
		const newConfig = Object.assign({}, supplied, { exporter: undefined, spanProcessors }) as TraceConfig
		return parseTraceConfig(newConfig, propagator)
	}
}

function parseLogsConfig(supplied: LogsConfig): ResolvedLogsConfig {
	const processors =
		supplied.transports && supplied.transports.length > 0
			? [new MultiTransportLogRecordProcessor(supplied.transports, supplied.batching)]
			: []

	return {
		processors,
		instrumentation: {
			instrumentConsole: supplied.instrumentation?.instrumentConsole ?? false,
		},
	}
}
