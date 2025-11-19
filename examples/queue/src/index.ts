import { instrument, ResolveConfigFn } from '../../../src/index'

interface QueueData {
	pathname: string
}
export interface Env {
	QUEUE: Queue<QueueData>
	SIGNOZ_ENDPOINT: string
	API_KEY: string
}

const handler: ExportedHandler<Env, QueueData> = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url)
		await env.QUEUE.send({ pathname: url.pathname })
		return new Response('Hello World!')
	},

	async queue(batch: MessageBatch<QueueData>, env: Env, ctx: ExecutionContext) {
		for (const message of batch.messages) {
			console.log(message.body.pathname)
			message.ack()
		}
	},
}

const config: ResolveConfigFn = (env: Env, trigger) => {
	return {
		exporter: {
			url: env.SIGNOZ_ENDPOINT,
			headers: { 'signoz-access-token': env.API_KEY },
		},
		service: {
			name: 'greetings',
			version: '0.1',
		},
	}
}

export default instrument(handler, config)
