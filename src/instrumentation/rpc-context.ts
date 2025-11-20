import { context as api_context, propagation, Context } from '@opentelemetry/api'

/**
 * Magic symbol to identify RPC context carrier objects
 * This helps us distinguish our injected context from user arguments
 */
const RPC_CONTEXT_MARKER = '__otel_rpc_ctx__'

/**
 * RPC Context Carrier
 * A plain object that can be serialized and passed through RPC calls
 */
export interface RpcContextCarrier {
	[RPC_CONTEXT_MARKER]: true
	headers: Record<string, string>
	// Metadata about the RPC call
	doName?: string // DO name if available (from id.name)
}

/**
 * Check if an object is an RPC context carrier
 */
export function isRpcContextCarrier(obj: unknown): obj is RpcContextCarrier {
	return typeof obj === 'object' && obj !== null && RPC_CONTEXT_MARKER in obj && obj[RPC_CONTEXT_MARKER] === true
}

/**
 * Inject the current trace context into an RPC context carrier
 * This serializes the active context into a plain object that can be
 * passed as an argument through RPC calls
 */
export function injectRpcContext(ctx: Context = api_context.active(), doName?: string): RpcContextCarrier {
	const carrier: RpcContextCarrier = {
		[RPC_CONTEXT_MARKER]: true,
		headers: {},
	}

	// Add DO name if provided
	if (doName) {
		carrier.doName = doName
	}

	// Use OpenTelemetry's propagation API to inject context into headers
	propagation.inject(ctx, carrier.headers, {
		set: (headers, key, value) => {
			headers[key] = typeof value === 'string' ? value : String(value)
		},
	})

	return carrier
}

/**
 * Extract trace context from an RPC context carrier
 * This deserializes the context from the carrier object back into
 * an OpenTelemetry Context that can be used as a parent span
 */
export function extractRpcContext(carrier: RpcContextCarrier): Context {
	return propagation.extract(api_context.active(), carrier.headers, {
		get(headers, key) {
			return headers[key] || undefined
		},
		keys(headers) {
			return Object.keys(headers)
		},
	})
}

/**
 * Remove RPC context carrier from arguments array if present
 * Returns a tuple of [extracted context or undefined, cleaned args]
 */
export function extractAndRemoveRpcContext(args: unknown[]): [Context | undefined, unknown[]] {
	if (args.length > 0 && isRpcContextCarrier(args[0])) {
		const carrier = args[0]
		const extractedContext = extractRpcContext(carrier)
		const cleanedArgs = args.slice(1)
		return [extractedContext, cleanedArgs]
	}
	return [undefined, args]
}
