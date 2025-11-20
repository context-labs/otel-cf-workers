import { HrTime, TimeInput, trace } from '@opentelemetry/api'
import { InstrumentationScope, sanitizeAttributes } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { LogAttributes, LogBody, ReadableLogRecord } from './types'
import { SeverityNumber } from '../constants'

function millisToHr(millis: number): HrTime {
	return [Math.trunc(millis / 1000), (millis % 1000) * 1e6]
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
		this.attributes = sanitizeAttributes(init.attributes || {})
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
