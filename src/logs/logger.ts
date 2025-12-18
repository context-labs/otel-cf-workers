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
	private properties: LogAttributes

	constructor(
		name: string,
		processors: LogRecordProcessor[],
		resource: Resource,
		version?: string,
		properties?: LogAttributes,
	) {
		this.name = name
		this.processors = processors
		this.resource = resource
		this.version = version
		this.properties = properties || {}
	}

	emit(logRecord: Partial<LogRecord>): void {
		// Merge properties with log-specific attributes
		const mergedAttributes = {
			...this.properties,
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
		this.emit({
			severityNumber: SEVERITY_NUMBERS.TRACE,
			severityText: 'TRACE',
			body: message,
			attributes,
		})
	}

	debug(message: string, attributes?: LogAttributes): void {
		this.emit({
			severityNumber: SEVERITY_NUMBERS.DEBUG,
			severityText: 'DEBUG',
			body: message,
			attributes,
		})
	}

	info(message: string, attributes?: LogAttributes): void {
		this.emit({
			severityNumber: SEVERITY_NUMBERS.INFO,
			severityText: 'INFO',
			body: message,
			attributes,
		})
	}

	warn(message: string, attributes?: LogAttributes): void {
		this.emit({
			severityNumber: SEVERITY_NUMBERS.WARN,
			severityText: 'WARN',
			body: message,
			attributes,
		})
	}

	error(message: string, attributes?: LogAttributes): void {
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
	 * Create a child logger with a concatenated name (parent:child) that inherits properties from this logger
	 * Child properties are merged with parent properties (child takes precedence)
	 */
	child(name: string, attributes?: LogAttributes): Logger {
		const childName = `${this.name}:${name}`
		const mergedProperties = {
			...this.properties,
			...(attributes || {}),
		}

		return new WorkerLogger(childName, this.processors, this.resource, this.version, mergedProperties)
	}

	/**
	 * Add properties to this logger that will be included in all future log records
	 * New properties are merged with existing properties (new takes precedence)
	 */
	setProperties(attributes: LogAttributes): this {
		this.properties = {
			...this.properties,
			...attributes,
		}
		return this
	}
}
