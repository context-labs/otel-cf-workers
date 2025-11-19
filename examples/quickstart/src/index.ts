import { instrument, ResolveConfigFn } from '@inference-net/otel-cf-workers'
import { trace } from '@opentelemetry/api'

export interface Env {
	SIGNOZ_ENDPOINT: string
	SIGNOZ_ACCESS_TOKEN: string
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Get the URL of the origin server
		const url = new URL(request.url)
		const originUrl = `https://${url.hostname}${url.pathname}${url.search}`

		// Create a new request to the origin server
		const originRequest = new Request(originUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		})

		// Add tracing information
		trace.getActiveSpan()?.setAttribute('origin_url', originUrl)

		// Fetch from the origin server
		// Return the response from the origin server
		return await fetch(originRequest)
	},
}

const config: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: env.SIGNOZ_ENDPOINT,
			headers: { 'signoz-access-token': env.SIGNOZ_ACCESS_TOKEN },
		},
		service: { name: 'my-service-name' },
	}
}

export default instrument(handler, config)
