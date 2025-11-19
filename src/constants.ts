// note (harry): These constants are injected at build time by Vite
declare const __PACKAGE_VERSION__: string
declare const __PACKAGE_NAME__: string

export const PACKAGE_VERSION = __PACKAGE_VERSION__
export const PACKAGE_NAME = __PACKAGE_NAME__

/**
 * Cloudflare-specific OpenTelemetry attribute keys
 * Aligned with official Cloudflare Workers telemetry specification
 */

// ============================================================================
// Universal Attributes (all spans)
// ============================================================================

export const ATTR_CLOUD_PROVIDER = 'cloud.provider'
export const ATTR_CLOUD_PLATFORM = 'cloud.platform'
export const ATTR_CLOUDFLARE_COLO = 'cloudflare.colo'
export const ATTR_CLOUDFLARE_SCRIPT_NAME = 'cloudflare.script_name'
export const ATTR_CLOUDFLARE_SCRIPT_TAGS = 'cloudflare.script_tags'
export const ATTR_CLOUDFLARE_SCRIPT_VERSION_ID = 'cloudflare.script_version.id'
export const ATTR_TELEMETRY_SDK_NAME = 'telemetry.sdk.name'
export const ATTR_TELEMETRY_SDK_LANGUAGE = 'telemetry.sdk.language'

// ============================================================================
// Root Span Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_RAY_ID = 'cloudflare.ray_id'
export const ATTR_CLOUDFLARE_HANDLER_TYPE = 'cloudflare.handler_type'
export const ATTR_CLOUDFLARE_ENTRYPOINT = 'cloudflare.entrypoint'
export const ATTR_CLOUDFLARE_EXECUTION_MODEL = 'cloudflare.execution_model'
export const ATTR_CLOUDFLARE_OUTCOME = 'cloudflare.outcome'
export const ATTR_CLOUDFLARE_CPU_TIME_MS = 'cloudflare.cpu_time_ms'
export const ATTR_CLOUDFLARE_WALL_TIME_MS = 'cloudflare.wall_time_ms'

// ============================================================================
// HTTP / Fetch Handler Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_VERIFIED_BOT_CATEGORY = 'cloudflare.verified_bot_category'
export const ATTR_CLOUDFLARE_ASN = 'cloudflare.asn'
export const ATTR_CLOUDFLARE_RESPONSE_TTFB_MS = 'cloudflare.response.time_to_first_byte_ms'

// Geo attributes
export const ATTR_GEO_TIMEZONE = 'geo.timezone'
export const ATTR_GEO_CONTINENT_CODE = 'geo.continent.code'
export const ATTR_GEO_COUNTRY_CODE = 'geo.country.code'
export const ATTR_GEO_LOCALITY_NAME = 'geo.locality.name'
export const ATTR_GEO_LOCALITY_REGION = 'geo.locality.region'

// User agent attributes
export const ATTR_USER_AGENT_OS_NAME = 'user_agent.os.name'
export const ATTR_USER_AGENT_OS_VERSION = 'user_agent.os.version'
export const ATTR_USER_AGENT_BROWSER_NAME = 'user_agent.browser.name'
export const ATTR_USER_AGENT_BROWSER_MAJOR_VERSION = 'user_agent.browser.major_version'
export const ATTR_USER_AGENT_BROWSER_VERSION = 'user_agent.browser.version'
export const ATTR_USER_AGENT_ENGINE_NAME = 'user_agent.engine.name'
export const ATTR_USER_AGENT_ENGINE_VERSION = 'user_agent.engine.version'
export const ATTR_USER_AGENT_DEVICE_TYPE = 'user_agent.device.type'
export const ATTR_USER_AGENT_DEVICE_VENDOR = 'user_agent.device.vendor'
export const ATTR_USER_AGENT_DEVICE_MODEL = 'user_agent.device.model'

// HTTP headers
export const ATTR_HTTP_REQUEST_HEADER_CONTENT_TYPE = 'http.request.header.content-type'
export const ATTR_HTTP_REQUEST_HEADER_CONTENT_LENGTH = 'http.request.header.content-length'
export const ATTR_HTTP_REQUEST_HEADER_ACCEPT = 'http.request.header.accept'
export const ATTR_HTTP_REQUEST_HEADER_ACCEPT_ENCODING = 'http.request.header.accept-encoding'
export const ATTR_HTTP_REQUEST_HEADER_ACCEPT_LANGUAGE = 'http.request.header.accept-language'

// ============================================================================
// Scheduled Handler Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_SCHEDULED_TIME = 'cloudflare.scheduled_time'

// ============================================================================
// Queue Handler Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_QUEUE_NAME = 'cloudflare.queue.name'
export const ATTR_CLOUDFLARE_QUEUE_BATCH_SIZE = 'cloudflare.queue.batch_size'

// ============================================================================
// Email Handler Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_EMAIL_FROM = 'cloudflare.email.from'
export const ATTR_CLOUDFLARE_EMAIL_TO = 'cloudflare.email.to'
export const ATTR_CLOUDFLARE_EMAIL_SIZE = 'cloudflare.email.size'

// ============================================================================
// Binding Attributes (Common)
// ============================================================================

export const ATTR_CLOUDFLARE_BINDING_TYPE = 'cloudflare.binding.type'
export const ATTR_CLOUDFLARE_BINDING_NAME = 'cloudflare.binding.name'
export const ATTR_DB_SYSTEM_NAME = 'db.system.name'
export const ATTR_DB_OPERATION_NAME = 'db.operation.name'

// ============================================================================
// D1 Database Attributes
// ============================================================================

export const ATTR_DB_QUERY_TEXT = 'db.query.text'
export const ATTR_DB_OPERATION_BATCH_SIZE = 'db.operation.batch.size'

export const ATTR_CLOUDFLARE_D1_QUERY_BOOKMARK = 'cloudflare.d1.query.bookmark'
export const ATTR_CLOUDFLARE_D1_RESPONSE_BOOKMARK = 'cloudflare.d1.response.bookmark'
export const ATTR_CLOUDFLARE_D1_RESPONSE_SIZE_AFTER = 'cloudflare.d1.response.size_after'
export const ATTR_CLOUDFLARE_D1_RESPONSE_ROWS_READ = 'cloudflare.d1.response.rows_read'
export const ATTR_CLOUDFLARE_D1_RESPONSE_ROWS_WRITTEN = 'cloudflare.d1.response.rows_written'
export const ATTR_CLOUDFLARE_D1_RESPONSE_LAST_ROW_ID = 'cloudflare.d1.response.last_row_id'
export const ATTR_CLOUDFLARE_D1_RESPONSE_CHANGED_DB = 'cloudflare.d1.response.changed_db'
export const ATTR_CLOUDFLARE_D1_RESPONSE_CHANGES = 'cloudflare.d1.response.changes'
export const ATTR_CLOUDFLARE_D1_RESPONSE_SERVED_BY_REGION = 'cloudflare.d1.response.served_by_region'
export const ATTR_CLOUDFLARE_D1_RESPONSE_SERVED_BY_PRIMARY = 'cloudflare.d1.response.served_by_primary'
export const ATTR_CLOUDFLARE_D1_RESPONSE_SQL_DURATION_MS = 'cloudflare.d1.response.sql_duration_ms'
export const ATTR_CLOUDFLARE_D1_RESPONSE_TOTAL_ATTEMPTS = 'cloudflare.d1.response.total_attempts'

// ============================================================================
// KV Namespace Attributes
// ============================================================================

// Query attributes
export const ATTR_CLOUDFLARE_KV_QUERY_KEYS = 'cloudflare.kv.query.keys'
export const ATTR_CLOUDFLARE_KV_QUERY_KEYS_COUNT = 'cloudflare.kv.query.keys.count'
export const ATTR_CLOUDFLARE_KV_QUERY_TYPE = 'cloudflare.kv.query.type'
export const ATTR_CLOUDFLARE_KV_QUERY_CACHE_TTL = 'cloudflare.kv.query.cache_ttl'
export const ATTR_CLOUDFLARE_KV_QUERY_VALUE_TYPE = 'cloudflare.kv.query.value_type'
export const ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION = 'cloudflare.kv.query.expiration'
export const ATTR_CLOUDFLARE_KV_QUERY_EXPIRATION_TTL = 'cloudflare.kv.query.expiration_ttl'
export const ATTR_CLOUDFLARE_KV_QUERY_METADATA = 'cloudflare.kv.query.metadata'
export const ATTR_CLOUDFLARE_KV_QUERY_PAYLOAD_SIZE = 'cloudflare.kv.query.payload.size'
export const ATTR_CLOUDFLARE_KV_QUERY_PREFIX = 'cloudflare.kv.query.prefix'
export const ATTR_CLOUDFLARE_KV_QUERY_LIMIT = 'cloudflare.kv.query.limit'
export const ATTR_CLOUDFLARE_KV_QUERY_CURSOR = 'cloudflare.kv.query.cursor'

// Response attributes
export const ATTR_CLOUDFLARE_KV_RESPONSE_SIZE = 'cloudflare.kv.response.size'
export const ATTR_CLOUDFLARE_KV_RESPONSE_RETURNED_ROWS = 'cloudflare.kv.response.returned_rows'
export const ATTR_CLOUDFLARE_KV_RESPONSE_METADATA = 'cloudflare.kv.response.metadata'
export const ATTR_CLOUDFLARE_KV_RESPONSE_CACHE_STATUS = 'cloudflare.kv.response.cache_status'
export const ATTR_CLOUDFLARE_KV_RESPONSE_LIST_COMPLETE = 'cloudflare.kv.response.list_complete'
export const ATTR_CLOUDFLARE_KV_RESPONSE_CURSOR = 'cloudflare.kv.response.cursor'
export const ATTR_CLOUDFLARE_KV_RESPONSE_EXPIRATION = 'cloudflare.kv.response.expiration'

// ============================================================================
// R2 Storage Attributes
// ============================================================================

// Query attributes
export const ATTR_CLOUDFLARE_R2_QUERY_KEY = 'cloudflare.r2.query.key'
export const ATTR_CLOUDFLARE_R2_QUERY_PREFIX = 'cloudflare.r2.query.prefix'
export const ATTR_CLOUDFLARE_R2_QUERY_LIMIT = 'cloudflare.r2.query.limit'
export const ATTR_CLOUDFLARE_R2_QUERY_DELIMITER = 'cloudflare.r2.query.delimiter'
export const ATTR_CLOUDFLARE_R2_QUERY_START_AFTER = 'cloudflare.r2.query.start_after'
export const ATTR_CLOUDFLARE_R2_QUERY_INCLUDE = 'cloudflare.r2.query.include'
export const ATTR_CLOUDFLARE_R2_QUERY_RANGE = 'cloudflare.r2.query.range'
export const ATTR_CLOUDFLARE_R2_QUERY_OFFSET = 'cloudflare.r2.query.offset'
export const ATTR_CLOUDFLARE_R2_QUERY_LENGTH = 'cloudflare.r2.query.length'
export const ATTR_CLOUDFLARE_R2_QUERY_SUFFIX = 'cloudflare.r2.query.suffix'
export const ATTR_CLOUDFLARE_R2_QUERY_ONLY_IF = 'cloudflare.r2.query.only_if'

// Put operation attributes
export const ATTR_CLOUDFLARE_R2_PUT_HTTP_METADATA = 'cloudflare.r2.put.http_metadata'
export const ATTR_CLOUDFLARE_R2_PUT_CUSTOM_METADATA = 'cloudflare.r2.put.custom_metadata'
export const ATTR_CLOUDFLARE_R2_PUT_MD5 = 'cloudflare.r2.put.md5'
export const ATTR_CLOUDFLARE_R2_PUT_SHA1 = 'cloudflare.r2.put.sha1'
export const ATTR_CLOUDFLARE_R2_PUT_SHA256 = 'cloudflare.r2.put.sha256'
export const ATTR_CLOUDFLARE_R2_PUT_SHA384 = 'cloudflare.r2.put.sha384'
export const ATTR_CLOUDFLARE_R2_PUT_SHA512 = 'cloudflare.r2.put.sha512'
export const ATTR_CLOUDFLARE_R2_PUT_STORAGE_CLASS = 'cloudflare.r2.put.storage_class'

// Response attributes
export const ATTR_CLOUDFLARE_R2_RESPONSE_SIZE = 'cloudflare.r2.response.size'
export const ATTR_CLOUDFLARE_R2_RESPONSE_ETAG = 'cloudflare.r2.response.etag'
export const ATTR_CLOUDFLARE_R2_RESPONSE_VERSION = 'cloudflare.r2.response.version'
export const ATTR_CLOUDFLARE_R2_RESPONSE_UPLOADED = 'cloudflare.r2.response.uploaded'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_TYPE =
	'cloudflare.r2.response.http_metadata.content_type'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_LANGUAGE =
	'cloudflare.r2.response.http_metadata.content_language'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_DISPOSITION =
	'cloudflare.r2.response.http_metadata.content_disposition'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CONTENT_ENCODING =
	'cloudflare.r2.response.http_metadata.content_encoding'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_CONTROL =
	'cloudflare.r2.response.http_metadata.cache_control'
export const ATTR_CLOUDFLARE_R2_RESPONSE_HTTP_METADATA_CACHE_EXPIRY =
	'cloudflare.r2.response.http_metadata.cache_expiry'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CUSTOM_METADATA_KEYS = 'cloudflare.r2.response.custom_metadata.keys'
export const ATTR_CLOUDFLARE_R2_RESPONSE_RANGE = 'cloudflare.r2.response.range'
export const ATTR_CLOUDFLARE_R2_RESPONSE_STORAGE_CLASS = 'cloudflare.r2.response.storage_class'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_MD5 = 'cloudflare.r2.response.checksums.md5'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA1 = 'cloudflare.r2.response.checksums.sha1'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA256 = 'cloudflare.r2.response.checksums.sha256'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA384 = 'cloudflare.r2.response.checksums.sha384'
export const ATTR_CLOUDFLARE_R2_RESPONSE_CHECKSUMS_SHA512 = 'cloudflare.r2.response.checksums.sha512'

// List operation attributes
export const ATTR_CLOUDFLARE_R2_LIST_TRUNCATED = 'cloudflare.r2.list.truncated'
export const ATTR_CLOUDFLARE_R2_LIST_OBJECTS_COUNT = 'cloudflare.r2.list.objects.count'
export const ATTR_CLOUDFLARE_R2_LIST_DELIMITED_PREFIXES_COUNT = 'cloudflare.r2.list.delimited_prefixes.count'
export const ATTR_CLOUDFLARE_R2_LIST_CURSOR = 'cloudflare.r2.list.cursor'

// Multipart upload attributes
export const ATTR_CLOUDFLARE_R2_MULTIPART_UPLOAD_ID = 'cloudflare.r2.multipart.upload_id'
export const ATTR_CLOUDFLARE_R2_MULTIPART_PART_NUMBER = 'cloudflare.r2.multipart.part_number'
export const ATTR_CLOUDFLARE_R2_MULTIPART_PARTS_COUNT = 'cloudflare.r2.multipart.parts.count'

// ============================================================================
// Cache API Attributes
// ============================================================================

export const ATTR_CACHE_CONTROL_EXPIRATION = 'cache_control.expiration'
export const ATTR_CACHE_CONTROL_REVALIDATION = 'cache_control.revalidation'

// ============================================================================
// Durable Object Storage (KV API) Attributes
// ============================================================================

// Query attributes
export const ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS = 'cloudflare.durable_object.kv.query.keys'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS_COUNT = 'cloudflare.durable_object.kv.query.keys.count'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_START = 'cloudflare.durable_object.kv.query.start'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_START_AFTER = 'cloudflare.durable_object.kv.query.startAfter'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_END = 'cloudflare.durable_object.kv.query.end'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_PREFIX = 'cloudflare.durable_object.kv.query.prefix'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_REVERSE = 'cloudflare.durable_object.kv.query.reverse'
export const ATTR_CLOUDFLARE_DO_KV_QUERY_LIMIT = 'cloudflare.durable_object.kv.query.limit'

// Response attributes
export const ATTR_CLOUDFLARE_DO_KV_RESPONSE_DELETED_COUNT = 'cloudflare.durable_object.kv.response.deleted_count'

// Custom attributes (not in CF spec but useful)
export const ATTR_CLOUDFLARE_DO_ALLOW_CONCURRENCY = 'cloudflare.durable_object.allow_concurrency'
export const ATTR_CLOUDFLARE_DO_ALLOW_UNCONFIRMED = 'cloudflare.durable_object.allow_unconfirmed'
export const ATTR_CLOUDFLARE_DO_NO_CACHE = 'cloudflare.durable_object.no_cache'

// ============================================================================
// Durable Object SQL Storage Attributes (for future implementation)
// ============================================================================

export const ATTR_CLOUDFLARE_DO_SQL_QUERY_BINDINGS = 'cloudflare.durable_object.query.bindings'
export const ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_READ = 'cloudflare.durable_object.response.rows_read'
export const ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_WRITTEN = 'cloudflare.durable_object.response.rows_written'
export const ATTR_CLOUDFLARE_DO_SQL_RESPONSE_DB_SIZE = 'cloudflare.durable_object.response.db_size'
export const ATTR_CLOUDFLARE_DO_SQL_RESPONSE_STATEMENT_COUNT = 'cloudflare.durable_object.response.statement_count'

// ============================================================================
// Images Binding Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_IMAGES_KEY = 'cloudflare.images.key'
export const ATTR_CLOUDFLARE_IMAGES_VARIANT = 'cloudflare.images.variant'
export const ATTR_CLOUDFLARE_IMAGES_VARIANTS_COUNT = 'cloudflare.images.variants.count'
export const ATTR_CLOUDFLARE_IMAGES_UPLOADED = 'cloudflare.images.uploaded'
export const ATTR_CLOUDFLARE_IMAGES_RESPONSE_ID = 'cloudflare.images.response.id'
export const ATTR_CLOUDFLARE_IMAGES_RESPONSE_FILENAME = 'cloudflare.images.response.filename'
export const ATTR_CLOUDFLARE_IMAGES_METADATA_KEYS = 'cloudflare.images.metadata.keys'
export const ATTR_CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS = 'cloudflare.images.require_signed_urls'

// ============================================================================
// Rate Limiting Binding Attributes
// ============================================================================

export const ATTR_CLOUDFLARE_RATE_LIMIT_KEY = 'cloudflare.rate_limit.key'
export const ATTR_CLOUDFLARE_RATE_LIMIT_ALLOWED = 'cloudflare.rate_limit.allowed'
export const ATTR_CLOUDFLARE_RATE_LIMIT_SUCCESS = 'cloudflare.rate_limit.success'
