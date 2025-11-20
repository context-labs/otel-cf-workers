import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap'
import {
	ATTR_CLOUDFLARE_BINDING_TYPE,
	ATTR_CLOUDFLARE_BINDING_NAME,
	ATTR_DB_SYSTEM_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_DB_QUERY_TEXT,
	ATTR_CLOUDFLARE_R2_QUERY_KEY,
	ATTR_CLOUDFLARE_R2_QUERY_PREFIX,
	ATTR_CLOUDFLARE_R2_QUERY_LIMIT,
	ATTR_CLOUDFLARE_R2_QUERY_DELIMITER,
	ATTR_CLOUDFLARE_R2_QUERY_START_AFTER,
	ATTR_CLOUDFLARE_R2_QUERY_INCLUDE,
	ATTR_CLOUDFLARE_R2_QUERY_OFFSET,
	ATTR_CLOUDFLARE_R2_QUERY_LENGTH,
	ATTR_CLOUDFLARE_R2_QUERY_SUFFIX,
	ATTR_CLOUDFLARE_R2_QUERY_ONLY_IF,
	ATTR_CLOUDFLARE_R2_PUT_HTTP_METADATA,
	ATTR_CLOUDFLARE_R2_PUT_CUSTOM_METADATA,
	ATTR_CLOUDFLARE_R2_PUT_MD5,
	ATTR_CLOUDFLARE_R2_PUT_SHA1,
	ATTR_CLOUDFLARE_R2_PUT_SHA256,
	ATTR_CLOUDFLARE_R2_PUT_SHA384,
	ATTR_CLOUDFLARE_R2_PUT_SHA512,
	ATTR_CLOUDFLARE_R2_PUT_STORAGE_CLASS,
	ATTR_CLOUDFLARE_R2_RESPONSE_SIZE,
	ATTR_CLOUDFLARE_R2_RESPONSE_ETAG,
	ATTR_CLOUDFLARE_R2_RESPONSE_VERSION,
	ATTR_CLOUDFLARE_R2_RESPONSE_UPLOADED,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_TYPE,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_LANGUAGE,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_DISPOSITION,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_ENCODING,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_CONTROL,
	ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_EXPIRY,
	ATTR_CLOUDFLARE_R2_RESPONSE_CUSTOM_METADATA_KEYS,
	ATTR_CLOUDFLARE_R2_RESPONSE_RANGE,
	ATTR_CLOUDFLARE_R2_RESPONSE_STORAGE_CLASS,
	ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_MD5,
	ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA1,
	ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA256,
	ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA384,
	ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA512,
	ATTR_CLOUDFLARE_R2_LIST_TRUNCATED,
	ATTR_CLOUDFLARE_R2_LIST_OBJECTS_COUNT,
	ATTR_CLOUDFLARE_R2_LIST_DELIMITED_PREFIXES_COUNT,
	ATTR_CLOUDFLARE_R2_LIST_CURSOR,
	ATTR_CLOUDFLARE_R2_MULTIPART_UPLOAD_ID,
} from '../constants'

const dbSystem = 'Cloudflare R2'

// Helper to add object metadata attributes
function addObjectMetadata(attrs: Attributes, obj: R2Object | R2ObjectBody | null): void {
	if (!obj) return

	attrs[ATTR_CLOUDFLARE_R2_RESPONSE_SIZE] = obj.size
	attrs[ATTR_CLOUDFLARE_R2_RESPONSE_ETAG] = obj.etag
	attrs[ATTR_CLOUDFLARE_R2_RESPONSE_VERSION] = obj.version
	attrs[ATTR_CLOUDFLARE_R2_RESPONSE_UPLOADED] = obj.uploaded.toISOString()

	// HTTP Metadata
	if (obj.httpMetadata) {
		if (obj.httpMetadata.contentType) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_TYPE] = obj.httpMetadata.contentType
		}
		if (obj.httpMetadata.contentLanguage) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_LANGUAGE] = obj.httpMetadata.contentLanguage
		}
		if (obj.httpMetadata.contentDisposition) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_DISPOSITION] = obj.httpMetadata.contentDisposition
		}
		if (obj.httpMetadata.contentEncoding) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_ENCODING] = obj.httpMetadata.contentEncoding
		}
		if (obj.httpMetadata.cacheControl) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_CONTROL] = obj.httpMetadata.cacheControl
		}
		if (obj.httpMetadata.cacheExpiry) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_EXPIRY] = obj.httpMetadata.cacheExpiry.toISOString()
		}
	}

	// Custom Metadata
	if (obj.customMetadata && Object.keys(obj.customMetadata).length > 0) {
		attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CUSTOM_METADATA_KEYS] = Object.keys(obj.customMetadata).join(',')
	}

	// Range
	if (obj.range) {
		if ('offset' in obj.range && 'length' in obj.range) {
			const offset = obj.range.offset ?? 0
			const length = obj.range.length ?? 0
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_RANGE] = `${offset}-${offset + length - 1}`
		} else if ('suffix' in obj.range) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_RANGE] = `suffix-${obj.range.suffix}`
		}
	}

	// Storage Class
	if (obj.storageClass) {
		attrs[ATTR_CLOUDFLARE_R2_RESPONSE_STORAGE_CLASS] = obj.storageClass
	}

	// Checksums
	if (obj.checksums) {
		if (obj.checksums.md5) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_MD5] = Array.from(new Uint8Array(obj.checksums.md5))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
		if (obj.checksums.sha1) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA1] = Array.from(new Uint8Array(obj.checksums.sha1))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
		if (obj.checksums.sha256) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA256] = Array.from(new Uint8Array(obj.checksums.sha256))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
		if (obj.checksums.sha384) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA384] = Array.from(new Uint8Array(obj.checksums.sha384))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
		if (obj.checksums.sha512) {
			attrs[ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA512] = Array.from(new Uint8Array(obj.checksums.sha512))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
	}
}

// HEAD operation
function instrumentHead(fn: R2Bucket['head'], name: string): R2Bucket['head'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['head']> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'head',
				[ATTR_DB_QUERY_TEXT]: key,
				[ATTR_CLOUDFLARE_R2_QUERY_KEY]: key,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} head`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2Object | null
				addObjectMetadata(attributes, result)
				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// GET operation
function instrumentGet(fn: R2Bucket['get'], name: string): R2Bucket['get'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['get']> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const getOptions = argArray[1] as R2GetOptions | undefined
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'get',
				[ATTR_DB_QUERY_TEXT]: key,
				[ATTR_CLOUDFLARE_R2_QUERY_KEY]: key,
			}

			// Capture get options
			if (getOptions) {
				if (getOptions.range) {
					if ('offset' in getOptions.range) {
						attributes[ATTR_CLOUDFLARE_R2_QUERY_OFFSET] = getOptions.range.offset
						if ('length' in getOptions.range) {
							attributes[ATTR_CLOUDFLARE_R2_QUERY_LENGTH] = getOptions.range.length
						}
					} else if ('suffix' in getOptions.range) {
						attributes[ATTR_CLOUDFLARE_R2_QUERY_SUFFIX] = getOptions.range.suffix
					}
				}
				if (getOptions.onlyIf) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_ONLY_IF] = JSON.stringify(getOptions.onlyIf)
				}
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} get`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2ObjectBody | null
				addObjectMetadata(attributes, result)
				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// PUT operation
function instrumentPut(fn: R2Bucket['put'], name: string): R2Bucket['put'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['put']> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const putOptions = argArray[2] as R2PutOptions | undefined
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'put',
				[ATTR_DB_QUERY_TEXT]: key,
				[ATTR_CLOUDFLARE_R2_QUERY_KEY]: key,
			}

			// Capture put options
			if (putOptions) {
				if (putOptions.httpMetadata) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_HTTP_METADATA] = true
				}
				if (putOptions.customMetadata) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_CUSTOM_METADATA] = Object.keys(putOptions.customMetadata).join(',')
				}
				if (putOptions.md5) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_MD5] = true
				}
				if (putOptions.sha1) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_SHA1] = true
				}
				if (putOptions.sha256) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_SHA256] = true
				}
				if (putOptions.sha384) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_SHA384] = true
				}
				if (putOptions.sha512) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_SHA512] = true
				}
				if (putOptions.storageClass) {
					attributes[ATTR_CLOUDFLARE_R2_PUT_STORAGE_CLASS] = putOptions.storageClass
				}
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} put`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2Object
				addObjectMetadata(attributes, result)
				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// DELETE operation
function instrumentDelete(fn: R2Bucket['delete'], name: string): R2Bucket['delete'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['delete']> = {
		apply: (target, thisArg, argArray) => {
			const keys = argArray[0] as string | string[]
			const isArray = Array.isArray(keys)
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'delete',
			}

			if (isArray) {
				if (keys.length > 0) {
					attributes[ATTR_DB_QUERY_TEXT] = keys[0]
					attributes[ATTR_CLOUDFLARE_R2_QUERY_KEY] = keys[0]
				}
			} else {
				attributes[ATTR_DB_QUERY_TEXT] = keys
				attributes[ATTR_CLOUDFLARE_R2_QUERY_KEY] = keys
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} delete`, options, async (span) => {
				await Reflect.apply(target, thisArg, argArray)
				span.end()
			})
		},
	}
	return wrap(fn, handler)
}

// LIST operation
function instrumentList(fn: R2Bucket['list'], name: string): R2Bucket['list'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['list']> = {
		apply: (target, thisArg, argArray) => {
			const listOptions = argArray[0] as R2ListOptions | undefined
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'list',
			}

			// Capture list options
			if (listOptions) {
				if (listOptions.prefix) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_PREFIX] = listOptions.prefix
				}
				if (listOptions.limit) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_LIMIT] = listOptions.limit
				}
				if (listOptions.delimiter) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_DELIMITER] = listOptions.delimiter
				}
				if (listOptions.startAfter) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_START_AFTER] = listOptions.startAfter
				}
				if (listOptions.include) {
					attributes[ATTR_CLOUDFLARE_R2_QUERY_INCLUDE] = listOptions.include.join(',')
				}
				if (listOptions.cursor) {
					attributes[ATTR_CLOUDFLARE_R2_LIST_CURSOR] = listOptions.cursor
				}
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} list`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2Objects
				attributes[ATTR_CLOUDFLARE_R2_LIST_TRUNCATED] = result.truncated
				attributes[ATTR_CLOUDFLARE_R2_LIST_OBJECTS_COUNT] = result.objects.length
				if (result.delimitedPrefixes) {
					attributes[ATTR_CLOUDFLARE_R2_LIST_DELIMITED_PREFIXES_COUNT] = result.delimitedPrefixes.length
				}
				if (result.truncated && 'cursor' in result && result.cursor) {
					attributes[ATTR_CLOUDFLARE_R2_LIST_CURSOR] = result.cursor
				}
				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// CREATE MULTIPART UPLOAD operation
function instrumentCreateMultipartUpload(
	fn: R2Bucket['createMultipartUpload'],
	name: string,
): R2Bucket['createMultipartUpload'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['createMultipartUpload']> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'createMultipartUpload',
				[ATTR_DB_QUERY_TEXT]: key,
				[ATTR_CLOUDFLARE_R2_QUERY_KEY]: key,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} createMultipartUpload`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2MultipartUpload
				attributes[ATTR_CLOUDFLARE_R2_MULTIPART_UPLOAD_ID] = result.uploadId
				span.setAttributes(attributes)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

// RESUME MULTIPART UPLOAD operation
function instrumentResumeMultipartUpload(
	fn: R2Bucket['resumeMultipartUpload'],
	name: string,
): R2Bucket['resumeMultipartUpload'] {
	const tracer = trace.getTracer('r2')
	const handler: ProxyHandler<R2Bucket['resumeMultipartUpload']> = {
		apply: (target, thisArg, argArray) => {
			const key = argArray[0] as string
			const uploadId = argArray[1] as string
			const attributes: Attributes = {
				[ATTR_CLOUDFLARE_BINDING_TYPE]: 'R2',
				[ATTR_CLOUDFLARE_BINDING_NAME]: name,
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: 'resumeMultipartUpload',
				[ATTR_DB_QUERY_TEXT]: key,
				[ATTR_CLOUDFLARE_R2_QUERY_KEY]: key,
				[ATTR_CLOUDFLARE_R2_MULTIPART_UPLOAD_ID]: uploadId,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`R2 ${name} resumeMultipartUpload`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as R2MultipartUpload
				span.end()
				return result
			})
		},
	}
	return wrap(fn, handler)
}

export function instrumentR2Bucket(bucket: R2Bucket, name: string): R2Bucket {
	const bucketHandler: ProxyHandler<R2Bucket> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)

			// Don't instrument non-function properties
			if (typeof fn !== 'function') {
				return fn
			}

			switch (operation) {
				case 'head':
					return instrumentHead(fn, name)
				case 'get':
					return instrumentGet(fn, name)
				case 'put':
					return instrumentPut(fn, name)
				case 'delete':
					return instrumentDelete(fn, name)
				case 'list':
					return instrumentList(fn, name)
				case 'createMultipartUpload':
					return instrumentCreateMultipartUpload(fn, name)
				case 'resumeMultipartUpload':
					return instrumentResumeMultipartUpload(fn, name)
				default:
					// Don't instrument unknown methods
					return fn
			}
		},
	}
	return wrap(bucket, bucketHandler)
}
