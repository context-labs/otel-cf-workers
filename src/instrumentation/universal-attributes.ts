import { Attributes } from '@opentelemetry/api'
import {
	ATTR_CLOUD_PROVIDER,
	ATTR_CLOUD_PLATFORM,
	ATTR_CLOUDFLARE_COLO,
	ATTR_CLOUDFLARE_SCRIPT_NAME,
	ATTR_CLOUDFLARE_RAY_ID,
	ATTR_CLOUDFLARE_HANDLER_TYPE,
	ATTR_CLOUDFLARE_EXECUTION_MODEL,
	ATTR_TELEMETRY_SDK_NAME,
	ATTR_TELEMETRY_SDK_LANGUAGE,
	PACKAGE_NAME,
} from '../constants.js'

/**
 * Gather universal attributes that should be present on all spans
 */
export function gatherUniversalAttributes(serviceName?: string): Attributes {
	return {
		[ATTR_CLOUD_PROVIDER]: 'cloudflare',
		[ATTR_CLOUD_PLATFORM]: 'cloudflare.workers',
		[ATTR_TELEMETRY_SDK_NAME]: PACKAGE_NAME,
		[ATTR_TELEMETRY_SDK_LANGUAGE]: 'javascript',
		[ATTR_CLOUDFLARE_SCRIPT_NAME]: serviceName,
	}
}

/**
 * Gather root span attributes for HTTP fetch handlers
 */
export function gatherRootSpanAttributes(
	request: Request,
	handlerType: 'fetch' | 'scheduled' | 'queue' | 'email' | 'alarm',
	executionModel: 'stateless' | 'stateful' = 'stateless',
): Attributes {
	const attrs: Attributes = {
		[ATTR_CLOUDFLARE_HANDLER_TYPE]: handlerType,
		[ATTR_CLOUDFLARE_EXECUTION_MODEL]: executionModel,
	}

	// Ray ID from headers (for HTTP requests)
	const rayId = request.headers?.get('cf-ray')
	if (rayId) {
		attrs[ATTR_CLOUDFLARE_RAY_ID] = rayId
	}

	// Colo from request.cf
	if (request.cf?.colo) {
		attrs[ATTR_CLOUDFLARE_COLO] = request.cf.colo as string
	}

	return attrs
}
