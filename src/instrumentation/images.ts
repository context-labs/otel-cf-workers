import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap'
import {
	ATTR_CLOUDFLARE_BINDING_TYPE,
	ATTR_CLOUDFLARE_BINDING_NAME,
	ATTR_CLOUDFLARE_IMAGES_KEY,
	ATTR_CLOUDFLARE_IMAGES_VARIANTS_COUNT,
	ATTR_CLOUDFLARE_IMAGES_UPLOADED,
	ATTR_CLOUDFLARE_IMAGES_RESPONSE_ID,
	ATTR_CLOUDFLARE_IMAGES_RESPONSE_FILENAME,
	ATTR_CLOUDFLARE_IMAGES_METADATA_KEYS,
	ATTR_CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS,
} from '../constants'

// Note: Since Images binding isn't in @cloudflare/workers-types yet,
// we'll use generic types and duck-typing detection
type ImagesBinding = {
	get: (key: string) => Promise<unknown>
	list: (options?: unknown) => Promise<unknown>
	delete: (key: string) => Promise<void>
	[key: string]: unknown
}

// Instrument GET operation
function instrumentImagesGet(fn: Function, name: string): Function {
	const tracer = trace.getTracer('images')
	const handler: ProxyHandler<Function> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'Images',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_CLOUDFLARE_IMAGES_KEY]: key,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Images ${name} get`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as any

				// Add response metadata if available
				if (result && typeof result === 'object') {
					if (result.id) {
						attributes[ATTR_CLOUDFLARE_IMAGES_RESPONSE_ID] = result.id
					}
					if (result.filename) {
						attributes[ATTR_CLOUDFLARE_IMAGES_RESPONSE_FILENAME] = result.filename
					}
					if (result.uploaded) {
						attributes[ATTR_CLOUDFLARE_IMAGES_UPLOADED] = result.uploaded
					}
					if (result.metadata && typeof result.metadata === 'object') {
						attributes[ATTR_CLOUDFLARE_IMAGES_METADATA_KEYS] = Object.keys(result.metadata).join(',')
					}
					if (result.variants && Array.isArray(result.variants)) {
						attributes[ATTR_CLOUDFLARE_IMAGES_VARIANTS_COUNT] = result.variants.length
					}
					if (typeof result.requireSignedURLs === 'boolean') {
						attributes[ATTR_CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS] = result.requireSignedURLs
					}
				}

				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// Instrument LIST operation
function instrumentImagesList(fn: Function, name: string): Function {
	const tracer = trace.getTracer('images')
	const handler: ProxyHandler<Function> = {
		apply: (target, thisArg, argArray) => {
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'Images',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Images ${name} list`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as any

				// Add count of images returned
				if (result && typeof result === 'object' && Array.isArray(result.images)) {
					span.setAttribute('cloudflare.images.list.count', result.images.length)
				}

				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// Instrument DELETE operation
function instrumentImagesDelete(fn: Function, name: string): Function {
	const tracer = trace.getTracer('images')
	const handler: ProxyHandler<Function> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'Images',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_CLOUDFLARE_IMAGES_KEY]: key,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Images ${name} delete`, options, async (span) => {
				await Reflect.apply(target, thisArg, argArray)
				span.end()
			})
		},
	}
	return wrap(fn, handler)
}

export function instrumentImagesBinding(images: ImagesBinding, name: string): ImagesBinding {
	const imagesHandler: ProxyHandler<ImagesBinding> = {
		get: (target, prop, receiver) => {
			const fn = Reflect.get(target, prop, receiver)

			// Don't instrument non-function properties
			if (typeof fn !== 'function') {
				return fn
			}

			switch (String(prop)) {
				case 'get':
					return instrumentImagesGet(fn, name)
				case 'list':
					return instrumentImagesList(fn, name)
				case 'delete':
					return instrumentImagesDelete(fn, name)
				default:
					// Don't instrument unknown methods
					return fn
			}
		},
	}
	return wrap(images, imagesHandler)
}
