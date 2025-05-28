/**
 * CORS utilities for consistent header management across API routes
 */

// Default CORS headers for all responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// Extended CORS headers with cache control for OPTIONS responses
export const optionsCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Max-Age': '86400', // 24 hours
};

/**
 * Environment-specific configuration
 * In production, you might want to restrict the origin to your frontend domain
 */
export const getCorsOrigin = () => {
  // Use environment variable if available, otherwise allow all origins
  return process.env.NEXT_PUBLIC_FRONTEND_URL || '*';
};

/**
 * Adds CORS headers to a response object
 * @param {Object} response - NextResponse object
 * @param {Object} headers - Optional additional headers
 * @returns {Object} - Response with CORS headers
 */
export const addCorsHeaders = (response, headers = {}) => {
  // Get existing headers from the response
  const existingHeaders = response.headers;

  // Create a new headers object with CORS headers and any additional headers
  const newHeaders = new Headers(existingHeaders);

  // Add all CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  // Add any additional headers
  Object.entries(headers).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  // Create a new response with the same status, body, and updated headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

/**
 * Creates a response for OPTIONS requests with proper CORS headers
 * @returns {Response} - Response for OPTIONS requests
 */
export const handleOptionsRequest = () => {
  return new Response(null, {
    status: 204,
    headers: optionsCorsHeaders,
  });
};

/**
 * Middleware function to add CORS headers to the response
 * @param {Object} response - NextResponse object from middleware
 * @returns {Object} - Response with CORS headers
 */
export const corsMiddleware = (response) => {
  // Clone the response to avoid modifying the original
  const newResponse = response.clone();

  // Add CORS headers to the response
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
};
