import { Context, Span } from '@opentelemetry/api'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
import { Effect } from 'effect'
import { getActiveConfig } from './config'
import { TraceFlushableSpanProcessor } from './types'
import { TailSampleFn } from './sampling'

function getSampler(): TailSampleFn {
	const conf = getActiveConfig()
	if (!conf) {
		console.log('Could not find config for sampling, sending everything by default')
	}
	return conf ? conf.sampling.tailSampler : () => true
}

class TraceState {
	private unexportedSpans: ReadableSpan[] = []
	private inprogressSpans = new Set<string>()
	private exporter: SpanExporter
	private readonly exportPromises = new Set<Promise<void>>()
	private localRootSpan?: ReadableSpan
	private traceDecision?: boolean
	private flushPromise?: Promise<void>

	constructor(
		exporter: SpanExporter,
		private readonly tailSampler?: TailSampleFn,
	) {
		this.exporter = exporter
	}

	addSpan(span: Span): void {
		const readableSpan = span as unknown as ReadableSpan
		this.localRootSpan = this.localRootSpan || readableSpan
		this.unexportedSpans.push(readableSpan)
		this.inprogressSpans.add(span.spanContext().spanId)
	}

	endSpan(span: ReadableSpan): Promise<void> | undefined {
		this.inprogressSpans.delete(span.spanContext().spanId)
		if (this.inprogressSpans.size === 0) {
			return this.flush()
		}
		return undefined
	}

	isComplete(): boolean {
		return this.inprogressSpans.size === 0 && this.unexportedSpans.length === 0 && this.exportPromises.size === 0
	}

	sample() {
		if (this.traceDecision === undefined && this.unexportedSpans.length > 0) {
			const sampler = this.tailSampler ?? getSampler()
			this.traceDecision = sampler({
				traceId: this.localRootSpan!.spanContext().traceId,
				localRootSpan: this.localRootSpan!,
				spans: this.unexportedSpans,
			})
		}
		this.unexportedSpans = this.traceDecision ? this.unexportedSpans : []
	}

	flush(): Promise<void> {
		if (this.flushPromise) return this.flushPromise
		const flushPromise = Promise.resolve().then(() => this.flushInternal())
		this.flushPromise = flushPromise
		void flushPromise.then(
			() => {
				if (this.flushPromise === flushPromise) this.flushPromise = undefined
			},
			() => {
				if (this.flushPromise === flushPromise) this.flushPromise = undefined
			},
		)
		return flushPromise
	}

	private async flushInternal(): Promise<void> {
		if (this.unexportedSpans.length > 0) {
			const unfinishedSpans = this.unexportedSpans.filter((span) => this.isSpanInProgress(span)) as unknown as Span[]
			for (const span of unfinishedSpans) {
				console.log(`Span ${span.spanContext().spanId} was not ended properly`)
				span.end()
			}
			this.sample()
			if (this.unexportedSpans.length > 0) {
				const exportPromise = this.exportSpans(this.unexportedSpans)
				this.exportPromises.add(exportPromise)
				void exportPromise.then(
					() => this.exportPromises.delete(exportPromise),
					() => this.exportPromises.delete(exportPromise),
				)
			}
			this.unexportedSpans = []
		}
		if (this.exportPromises.size > 0) {
			await Promise.all(this.exportPromises)
		}
	}

	private isSpanInProgress(span: ReadableSpan) {
		return this.inprogressSpans.has(span.spanContext().spanId)
	}

	private exportSpans(spans: ReadonlyArray<ReadableSpan>): Promise<void> {
		return Effect.runPromise(
			Effect.tryPromise({
				try: () =>
					new Promise<void>((resolve, reject) => {
						this.exporter.export([...spans], (result) => {
							if (result.code === ExportResultCode.SUCCESS) {
								resolve()
							} else {
								reject(result.error ?? new Error('Span exporter failed without an error'))
							}
						})
					}),
				catch: (cause) => cause,
			}),
		)
	}
}

type traceId = string
export class BatchTraceSpanProcessor implements TraceFlushableSpanProcessor {
	private traces: Record<traceId, TraceState> = {}

	constructor(
		private exporter: SpanExporter,
		private readonly tailSampler?: TailSampleFn,
	) {}

	getTraceState(traceId: string): TraceState {
		const traceState = this.traces[traceId] || new TraceState(this.exporter, this.tailSampler)
		this.traces[traceId] = traceState
		return traceState
	}

	onStart(span: Span, _parentContext: Context): void {
		const traceId = span.spanContext().traceId
		this.getTraceState(traceId).addSpan(span)
	}

	onEnd(span: ReadableSpan): void {
		const traceId = span.spanContext().traceId
		const state = this.getTraceState(traceId)
		const flush = state.endSpan(span)
		if (flush) {
			void flush
				.then(() => {
					if (state.isComplete()) delete this.traces[traceId]
				})
				.catch((error) => console.error('Failed to export trace:', error))
		}
	}

	async forceFlush(traceId?: traceId): Promise<void> {
		if (traceId) {
			await this.getTraceState(traceId).flush()
		} else {
			await Promise.all(Object.values(this.traces).map((traceState) => traceState.flush()))
		}
	}

	async shutdown(): Promise<void> {
		await this.forceFlush()
	}
}
