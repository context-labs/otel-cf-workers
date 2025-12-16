import { HrTime, TimeInput, trace } from '@opentelemetry/api'
import { InstrumentationScope, sanitizeAttributes } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { LogAttributes, LogBody, ReadableLogRecord } from './types'
import { SeverityNumber } from '../constants'

function millisToHr(millis: number): HrTime {
	return [Math.trunc(millis / 1000), (millis % 1000) * 1e6]
}

/**
 * Extracts Error properties into a flat object with semantic naming.
 * Uses OpenTelemetry semantic conventions for exception attributes.
 */
function flattenError(error: Error, prefix: string): LogAttributes {
	const result: LogAttributes = {}
	result[`${prefix}.type`] = error.name
	result[`${prefix}.message`] = error.message
	if (error.stack) {
		result[`${prefix}.stacktrace`] = error.stack
	}
	// Handle cause if present (ES2022 Error cause)
	if ('cause' in error && error.cause) {
		if (error.cause instanceof Error) {
			Object.assign(result, flattenError(error.cause, `${prefix}.cause`))
		} else {
			result[`${prefix}.cause`] = String(error.cause)
		}
	}
	return result
}

/**
 * Flattens nested objects in attributes to dot-notation keys.
 * e.g., {user: {name: 'John', age: 30}} becomes {'user.name': 'John', 'user.age': 30}
 * Arrays of primitives are preserved, arrays containing objects have their objects flattened.
 * Error objects are handled specially to extract type, message, and stacktrace.
 */
function flattenAttributes(attrs: LogAttributes, prefix = ''): LogAttributes {
	const result: LogAttributes = {}

	for (const [key, value] of Object.entries(attrs)) {
		const fullKey = prefix ? `${prefix}.${key}` : key

		if (value === null || value === undefined) {
			// Skip null/undefined values
			continue
		} else if (value instanceof Error) {
			// Special handling for Error objects
			Object.assign(result, flattenError(value, fullKey))
		} else if (Array.isArray(value)) {
			// Check if array contains objects that need flattening
			const hasObjects = value.some((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
			if (hasObjects) {
				// Flatten each object in the array with index
				value.forEach((item, index) => {
					if (item instanceof Error) {
						Object.assign(result, flattenError(item, `${fullKey}.${index}`))
					} else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
						Object.assign(result, flattenAttributes(item, `${fullKey}.${index}`))
					} else if (item !== null && item !== undefined) {
						result[`${fullKey}.${index}`] = item
					}
				})
			} else {
				// Array of primitives - keep as-is
				result[fullKey] = value
			}
		} else if (typeof value === 'object') {
			// Recursively flatten nested objects
			Object.assign(result, flattenAttributes(value as LogAttributes, fullKey))
		} else {
			// Primitive value - keep as-is
			result[fullKey] = value
		}
	}

	return result
}

function getHrTime(input?: TimeInput): HrTime {
	const now = Date.now()
	if (!input) {
		return millisToHr(now)
	} else if (input instanceof Date) {
		return millisToHr(input.getTime())
	} else if (typeof input === 'number') {
		return millisToHr(input)
	} else if (Array.isArray(input)) {
		return input
	}

	const v: never = input
	throw new Error(`unreachable value: ${JSON.stringify(v)}`)
}

export interface LogRecordInit {
	severityNumber?: SeverityNumber
	severityText?: string
	body?: LogBody
	attributes?: LogAttributes
	timestamp?: TimeInput
	observedTimestamp?: TimeInput
	traceId?: string
	spanId?: string
	traceFlags?: number
	resource: Resource
	instrumentationScope?: InstrumentationScope
}

export class LogRecordImpl implements ReadableLogRecord {
	readonly timeUnixNano: HrTime
	readonly observedTimeUnixNano: HrTime
	readonly severityNumber?: SeverityNumber
	readonly severityText?: string
	readonly body?: LogBody
	readonly attributes: LogAttributes
	readonly traceId?: string
	readonly spanId?: string
	readonly traceFlags?: number
	readonly resource: Resource
	readonly instrumentationScope: InstrumentationScope
	readonly droppedAttributesCount: number = 0

	constructor(init: LogRecordInit) {
		this.timeUnixNano = getHrTime(init.timestamp)
		this.observedTimeUnixNano = getHrTime(init.observedTimestamp)
		this.severityNumber = init.severityNumber
		this.severityText = init.severityText
		this.body = init.body
		// Flatten nested objects to dot-notation before sanitizing
		const flattenedAttributes = flattenAttributes(init.attributes || {})
		this.attributes = sanitizeAttributes(flattenedAttributes)
		this.resource = init.resource
		this.instrumentationScope = init.instrumentationScope || {
			name: '@inference-net/otel-cf-workers',
		}

		// Auto-inject trace context from active span if not provided
		const activeSpan = trace.getActiveSpan()
		if (activeSpan && !init.traceId) {
			const spanContext = activeSpan.spanContext()
			this.traceId = spanContext.traceId
			this.spanId = spanContext.spanId
			this.traceFlags = spanContext.traceFlags
		} else {
			this.traceId = init.traceId
			this.spanId = init.spanId
			this.traceFlags = init.traceFlags
		}
	}
}
