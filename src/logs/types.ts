import { Context, HrTime } from '@opentelemetry/api'
import { InstrumentationScope } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { ExportResult } from '@opentelemetry/core'
import { SeverityNumber } from '../constants'
import { LogLevel } from '../types'

export type LogBody = string | Record<string, any>

/**
 * Log attributes must be a plain object with string keys.
 * This type explicitly excludes strings to prevent accidental argument swapping.
 */
export type LogAttributes = {
	[key: string]: unknown
} & { length?: never; substring?: never }

export interface LogRecord {
	readonly timeUnixNano: HrTime
	readonly observedTimeUnixNano: HrTime
	readonly severityNumber?: SeverityNumber
	readonly severityText?: string
	readonly body?: LogBody
	readonly attributes: LogAttributes
	readonly traceId?: string
	readonly spanId?: string
	readonly traceFlags?: number
}

export interface ReadableLogRecord extends LogRecord {
	readonly resource: Resource
	readonly instrumentationScope: InstrumentationScope
	readonly droppedAttributesCount: number
}

export interface Logger {
	emit(logRecord: Partial<LogRecord>): void
	trace(message: string, attributes?: LogAttributes): void
	debug(message: string, attributes?: LogAttributes): void
	info(message: string, attributes?: LogAttributes): void
	warn(message: string, attributes?: LogAttributes): void
	error(message: string, attributes?: LogAttributes): void
	fatal(message: string, attributes?: LogAttributes): void
	forceFlush(): Promise<void>
	child(name: string, attributes?: LogAttributes): Logger
	setProperties(attributes: LogAttributes): this
}

export interface LoggerProvider {
	getLogger(name: string, version?: string, options?: LoggerOptions): Logger
	register(): void
	shutdown(): Promise<void>
}

export interface LoggerOptions {
	schemaUrl?: string
}

export type ExportResultCallback = (result: ExportResult) => void

export interface LogTransport {
	readonly name: string
	export(logs: ReadableLogRecord[], callback: ExportResultCallback): void
	shutdown(): Promise<void>
}

export interface LogRecordProcessor {
	onEmit(logRecord: ReadableLogRecord, context: Context): void
	forceFlush(): Promise<void>
	shutdown(): Promise<void>
}

export interface BatchConfig {
	strategy?: 'immediate' | 'size'
	maxQueueSize?: number
	maxExportBatchSize?: number
}

export interface OTLPTransportConfig {
	url: string
	headers?: Record<string, string>
	level?: LogLevel
}

export interface ConsoleTransportConfig {
	pretty?: boolean
	colors?: boolean
	includeTimestamp?: boolean
	level?: LogLevel
	transformLog?: (logRecord: ReadableLogRecord) => ReadableLogRecord
}
