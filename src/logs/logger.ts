import { context as api_context, trace, SpanStatusCode } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { Logger, LogAttributes, LogRecordProcessor, LogRecord } from './types'
import { LogRecordImpl } from './logrecord'
import { SEVERITY_NUMBERS } from '../constants'

export class WorkerLogger implements Logger {
	private readonly processors: LogRecordProcessor[]
	private readonly resource: Resource
	private readonly name: string
	private readonly version?: string
	private readonly inheritedAttributes: LogAttributes
	private readonly minSeverity: number

	constructor(
		name: string,
		processors: LogRecordProcessor[],
		resource: Resource,
		version?: string,
		inheritedAttributes?: LogAttributes,
		minLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
	) {
		this.name = name
		this.processors = processors
		this.resource = resource
		this.version = version
		this.inheritedAttributes = inheritedAttributes || {}
		this.minSeverity = this.levelToSeverity(minLevel)
	}

	private levelToSeverity(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'): number {
		switch (level) {
			case 'trace':
				return SEVERITY_NUMBERS.TRACE
			case 'debug':
				return SEVERITY_NUMBERS.DEBUG
			case 'info':
				return SEVERITY_NUMBERS.INFO
			case 'warn':
				return SEVERITY_NUMBERS.WARN
			case 'error':
				return SEVERITY_NUMBERS.ERROR
			case 'fatal':
				return SEVERITY_NUMBERS.FATAL
		}
	}

	private shouldEmit(severityNumber: number): boolean {
		return severityNumber >= this.minSeverity
	}

	emit(logRecord: Partial<LogRecord>): void {
		// Merge inherited attributes with log-specific attributes
		const mergedAttributes = {
			...this.inheritedAttributes,
			...(logRecord.attributes || {}),
		}

		const record = new LogRecordImpl({
			...logRecord,
			attributes: mergedAttributes,
			resource: this.resource,
			instrumentationScope: {
				name: this.name,
				version: this.version,
			},
		})

		const context = api_context.active()
		this.processors.forEach((processor) => {
			processor.onEmit(record, context)
		})
	}

	trace(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.TRACE)) return

		this.emit({
			severityNumber: SEVERITY_NUMBERS.TRACE,
			severityText: 'TRACE',
			body: message,
			attributes,
		})
	}

	debug(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.DEBUG)) return

		this.emit({
			severityNumber: SEVERITY_NUMBERS.DEBUG,
			severityText: 'DEBUG',
			body: message,
			attributes,
		})
	}

	info(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.INFO)) return

		this.emit({
			severityNumber: SEVERITY_NUMBERS.INFO,
			severityText: 'INFO',
			body: message,
			attributes,
		})
	}

	warn(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.WARN)) return

		this.emit({
			severityNumber: SEVERITY_NUMBERS.WARN,
			severityText: 'WARN',
			body: message,
			attributes,
		})
	}

	error(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.ERROR)) return

		// Check if an error was provided in attributes
		const exception = attributes?.['error'] instanceof Error ? attributes['error'] : undefined

		// Record error on active span if one exists
		const activeSpan = trace.getActiveSpan()
		if (activeSpan) {
			activeSpan.setStatus({ code: SpanStatusCode.ERROR, message })
			if (exception) {
				activeSpan.recordException(exception)
			}
		}

		this.emit({
			severityNumber: SEVERITY_NUMBERS.ERROR,
			severityText: 'ERROR',
			body: message,
			attributes,
		})
	}

	fatal(message: string, attributes?: LogAttributes): void {
		if (!this.shouldEmit(SEVERITY_NUMBERS.FATAL)) return

		// Check if an error was provided in attributes
		const exception = attributes?.['error'] instanceof Error ? attributes['error'] : undefined

		// Record error on active span if one exists
		const activeSpan = trace.getActiveSpan()
		if (activeSpan) {
			activeSpan.setStatus({ code: SpanStatusCode.ERROR, message })
			if (exception) {
				activeSpan.recordException(exception)
			}
		}

		this.emit({
			severityNumber: SEVERITY_NUMBERS.FATAL,
			severityText: 'FATAL',
			body: message,
			attributes,
		})
	}

	async forceFlush(): Promise<void> {
		const promises = this.processors.map((p) => p.forceFlush())
		await Promise.allSettled(promises)
	}

	/**
	 * Create a child logger that inherits attributes from this logger
	 * Child attributes are merged with parent attributes (child takes precedence)
	 */
	child(attributes: LogAttributes): Logger {
		const mergedAttributes = {
			...this.inheritedAttributes,
			...attributes,
		}

		// Convert minSeverity back to level for child logger
		let minLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info'
		if (this.minSeverity <= SEVERITY_NUMBERS.TRACE) minLevel = 'trace'
		else if (this.minSeverity <= SEVERITY_NUMBERS.DEBUG) minLevel = 'debug'
		else if (this.minSeverity <= SEVERITY_NUMBERS.INFO) minLevel = 'info'
		else if (this.minSeverity <= SEVERITY_NUMBERS.WARN) minLevel = 'warn'
		else if (this.minSeverity <= SEVERITY_NUMBERS.ERROR) minLevel = 'error'
		else minLevel = 'fatal'

		return new WorkerLogger(this.name, this.processors, this.resource, this.version, mergedAttributes, minLevel)
	}
}
