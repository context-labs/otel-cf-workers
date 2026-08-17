import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'

import { gatherRequestAttributes, gatherResponseAttributes } from '../../src/instrumentation/fetch'

it.effect('collects request URL, headers, and body size attributes', () =>
	Effect.sync(() => {
		const request = new Request('https://worker.example:8443/items?q=test', {
			method: 'post',
			headers: {
				accept: 'application/json',
				'accept-encoding': 'gzip',
				'accept-language': 'en',
				'content-length': '12',
				'content-type': 'application/json',
				'user-agent': 'test-agent',
			},
		})

		expect(gatherRequestAttributes(request)).toMatchObject({
			'http.request.method': 'POST',
			'http.request.body.size': 12,
			'network.protocol.name': 'http',
			'server.address': 'worker.example:8443',
			'server.port': 8443,
			'url.path': '/items',
			'url.query': '?q=test',
			'user_agent.original': 'test-agent',
		})
	}),
)

it.effect('only records response size and MIME type when headers are present', () =>
	Effect.sync(() => {
		expect(
			gatherResponseAttributes(
				new Response('hello', {
					status: 201,
					headers: { 'content-length': '5', 'content-type': 'text/plain' },
				}),
			),
		).toEqual({
			'http.response.status_code': 201,
			'http.response.body.size': 5,
			'http.mime_type': 'text/plain',
		})
		expect(gatherResponseAttributes(new Response(null, { status: 204 }))).toEqual({
			'http.response.status_code': 204,
		})
	}),
)
