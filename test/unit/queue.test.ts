import { SpanKind, trace, type Attributes, type Span, type Tracer } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ATTR_CLOUDFLARE_QUEUE_BATCH_SIZE, ATTR_CLOUDFLARE_QUEUE_NAME } from '../../src/constants'
import { instrumentQueueSender, QueueInstrumentation } from '../../src/instrumentation/queue'

function message(id: string) {
	return {
		id,
		timestamp: new Date(`2026-01-0${id}T00:00:00.000Z`),
		body: { id },
		attempts: 1,
		ack: vi.fn(),
		retry: vi.fn(),
	} satisfies Message<{ id: string }>
}

function batch(messages = [message('1'), message('2'), message('3')]) {
	return {
		queue: 'orders',
		messages,
		metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
		ackAll: vi.fn(),
		retryAll: vi.fn(),
	} satisfies MessageBatch<{ id: string }>
}

function captureAttributes() {
	let attributes: Attributes | undefined
	const span = {
		setAttributes: vi.fn((value: Attributes) => {
			attributes = value
			return span
		}),
	} as unknown as Span
	return { span, attributes: () => attributes }
}

function expectCounts(
	attributes: Attributes | undefined,
	expected: {
		success: number
		failed: number
		implicitAck: number
		implicitRetry: number
		batchSuccess: boolean
	},
) {
	expect(attributes).toEqual({
		'queue.messages_count': 3,
		'queue.messages_success': expected.success,
		'queue.messages_failed': expected.failed,
		'queue.batch_success': expected.batchSuccess,
		'queue.implicitly_acked': expected.implicitAck,
		'queue.implicitly_retried': expected.implicitRetry,
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('queue consumer instrumentation', () => {
	it('creates consumer initial span info', () => {
		const input = batch()
		const info = new QueueInstrumentation().getInitialSpanInfo(input)

		expect(info).toEqual({
			name: 'queueHandler orders',
			options: {
				attributes: {
					'faas.trigger': 'pubsub',
					[ATTR_CLOUDFLARE_QUEUE_NAME]: 'orders',
					[ATTR_CLOUDFLARE_QUEUE_BATCH_SIZE]: 3,
				},
				kind: SpanKind.CONSUMER,
			},
		})
	})

	it('tracks per-message ack and retry, preserving method receivers and options', () => {
		const input = batch()
		const instrumentation = new QueueInstrumentation()
		const instrumented = instrumentation.instrumentTrigger(input)
		const first = instrumented.messages[0]!
		const second = instrumented.messages[1]!
		const retryOptions = { delaySeconds: 10 }

		first.ack()
		second.retry(retryOptions)

		expect(input.messages[0]!.ack).toHaveBeenCalledOnce()
		expect(input.messages[1]!.retry).toHaveBeenCalledWith(retryOptions)
		const capture = captureAttributes()
		instrumentation.executionSucces(capture.span, instrumented)
		expectCounts(capture.attributes(), {
			success: 2,
			failed: 1,
			implicitAck: 1,
			implicitRetry: 0,
			batchSuccess: false,
		})
	})

	it('does not double-count repeated or conflicting message outcomes', () => {
		const input = batch()
		const instrumentation = new QueueInstrumentation()
		const instrumented = instrumentation.instrumentTrigger(input)

		instrumented.messages[0]!.ack()
		instrumented.messages[0]!.ack()
		instrumented.messages[0]!.retry()

		const capture = captureAttributes()
		instrumentation.executionSucces(capture.span, instrumented)
		expectCounts(capture.attributes(), {
			success: 3,
			failed: 0,
			implicitAck: 2,
			implicitRetry: 0,
			batchSuccess: true,
		})
	})

	it('tracks ackAll and retryAll after explicit message outcomes', () => {
		const ackInput = batch()
		const ackInstrumentation = new QueueInstrumentation()
		const ackBatch = ackInstrumentation.instrumentTrigger(ackInput)
		ackBatch.messages[0]!.retry()
		ackBatch.ackAll()
		expect(ackInput.ackAll).toHaveBeenCalledOnce()
		const ackCapture = captureAttributes()
		ackInstrumentation.executionSucces(ackCapture.span, ackBatch)
		expectCounts(ackCapture.attributes(), {
			success: 2,
			failed: 1,
			implicitAck: 2,
			implicitRetry: 0,
			batchSuccess: false,
		})

		const retryInput = batch()
		const retryInstrumentation = new QueueInstrumentation()
		const retryBatch = retryInstrumentation.instrumentTrigger(retryInput)
		retryBatch.messages[0]!.ack()
		retryBatch.retryAll({ delaySeconds: 5 })
		expect(retryInput.retryAll).toHaveBeenCalledWith({ delaySeconds: 5 })
		const retryCapture = captureAttributes()
		retryInstrumentation.executionFailed(retryCapture.span, retryBatch)
		expectCounts(retryCapture.attributes(), {
			success: 1,
			failed: 2,
			implicitAck: 0,
			implicitRetry: 2,
			batchSuccess: false,
		})
	})

	it('implicitly acknowledges all messages on success and retries all on failure', () => {
		const successInstrumentation = new QueueInstrumentation()
		const successBatch = successInstrumentation.instrumentTrigger(batch())
		const successCapture = captureAttributes()
		successInstrumentation.executionSucces(successCapture.span, successBatch)
		expectCounts(successCapture.attributes(), {
			success: 3,
			failed: 0,
			implicitAck: 3,
			implicitRetry: 0,
			batchSuccess: true,
		})

		const failureInstrumentation = new QueueInstrumentation()
		const failureBatch = failureInstrumentation.instrumentTrigger(batch())
		const failureCapture = captureAttributes()
		failureInstrumentation.executionFailed(failureCapture.span, failureBatch)
		expectCounts(failureCapture.attributes(), {
			success: 0,
			failed: 3,
			implicitAck: 0,
			implicitRetry: 3,
			batchSuccess: false,
		})
	})

	it('adds message and batch outcome events to the active span', () => {
		const addEvent = vi.fn()
		vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ addEvent } as unknown as Span)
		const instrumented = new QueueInstrumentation().instrumentTrigger(batch())

		instrumented.messages[0]!.ack()
		instrumented.messages[1]!.retry()
		instrumented.ackAll()
		instrumented.retryAll()

		expect(addEvent).toHaveBeenNthCalledWith(1, 'messageAck', {
			'queue.message_id': '1',
			'queue.message_timestamp': '2026-01-01T00:00:00.000Z',
		})
		expect(addEvent).toHaveBeenNthCalledWith(2, 'messageRetry', {
			'queue.message_id': '2',
			'queue.message_timestamp': '2026-01-02T00:00:00.000Z',
		})
		expect(addEvent).toHaveBeenNthCalledWith(3, 'ackAll', {})
		expect(addEvent).toHaveBeenNthCalledWith(4, 'retryAll', {})
	})
})

describe('queue producer instrumentation', () => {
	function mockTracer() {
		const spans: Array<{
			name: string
			setAttribute: ReturnType<typeof vi.fn>
			recordException: ReturnType<typeof vi.fn>
			end: ReturnType<typeof vi.fn>
		}> = []
		const tracer = {
			startActiveSpan: vi.fn((name: string, callback: (span: Span) => unknown) => {
				const span = {
					name,
					setAttribute: vi.fn(),
					recordException: vi.fn(),
					end: vi.fn(),
				}
				spans.push(span)
				return callback(span as unknown as Span)
			}),
		} as unknown as Tracer
		vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
		return spans
	}

	it('traces send and sendBatch success and preserves the queue receiver', async () => {
		const spans = mockTracer()
		const sendResult = { metadata: { metrics: { backlogCount: 1, backlogBytes: 2 } } }
		const batchResult = { metadata: { metrics: { backlogCount: 3, backlogBytes: 4 } } }
		const queue = {
			marker: 'receiver',
			send: vi.fn(function (this: { marker: string }) {
				expect(this.marker).toBe('receiver')
				return Promise.resolve(sendResult)
			}),
			sendBatch: vi.fn(function (this: { marker: string }) {
				expect(this.marker).toBe('receiver')
				return Promise.resolve(batchResult)
			}),
		} as unknown as Queue<unknown> & { marker: string }
		const instrumented = instrumentQueueSender(queue, 'ORDERS')

		await expect(instrumented.send('one')).resolves.toBe(sendResult)
		await expect(instrumented.sendBatch([{ body: 'two' }])).resolves.toBe(batchResult)

		expect(spans.map((span) => span.name)).toEqual(['Queues ORDERS send', 'Queues ORDERS sendBatch'])
		expect(spans[0]!.setAttribute).toHaveBeenCalledWith('queue.operation', 'send')
		expect(spans[1]!.setAttribute).toHaveBeenCalledWith('queue.operation', 'sendBatch')
		expect(spans[0]!.end).toHaveBeenCalledOnce()
		expect(spans[1]!.end).toHaveBeenCalledOnce()
	})

	it('records and rethrows send and sendBatch errors, ending both spans', async () => {
		const spans = mockTracer()
		const sendError = new Error('send failed')
		const batchError = new Error('batch failed')
		const instrumented = instrumentQueueSender(
			{
				send: vi.fn(() => Promise.reject(sendError)),
				sendBatch: vi.fn(() => Promise.reject(batchError)),
			} as unknown as Queue<unknown>,
			'ORDERS',
		)

		await expect(instrumented.send('one')).rejects.toBe(sendError)
		await expect(instrumented.sendBatch([{ body: 'two' }])).rejects.toBe(batchError)

		expect(spans[0]!.recordException).toHaveBeenCalledWith(sendError)
		expect(spans[1]!.recordException).toHaveBeenCalledWith(batchError)
		expect(spans[0]!.end).toHaveBeenCalledOnce()
		expect(spans[1]!.end).toHaveBeenCalledOnce()
	})
})
