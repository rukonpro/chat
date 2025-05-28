/**
 * Error handling utilities for consistent error responses across API routes
 */

import { NextResponse } from 'next/server';

/**
 * Creates a standard error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {Object} additionalData - Additional data to include in the response
 * @returns {NextResponse} - NextResponse object with error details
 */
export const errorResponse = (message, status = 500, additionalData = {}) => {
  return NextResponse.json(
    { 
      message, 
      ...additionalData,
      success: false 
    }, 
    { status }
  );
};

/**
 * Creates a 400 Bad Request response
 * @param {string} message - Error message
 * @param {Object} additionalData - Additional data to include in the response
 * @returns {NextResponse} - NextResponse object with error details
 */
export const badRequestResponse = (message = 'Bad Request', additionalData = {}) => {
  return errorResponse(message, 400, additionalData);
};

/**
 * Creates a 401 Unauthorized response
 * @param {string} message - Error message
 * @param {Object} additionalData - Additional data to include in the response
 * @returns {NextResponse} - NextResponse object with error details
 */
export const unauthorizedResponse = (message = 'Unauthorized', additionalData = {}) => {
  return errorResponse(message, 401, additionalData);
};

/**
 * Creates a 404 Not Found response
 * @param {string} message - Error message
 * @param {Object} additionalData - Additional data to include in the response
 * @returns {NextResponse} - NextResponse object with error details
 */
export const notFoundResponse = (message = 'Not Found', additionalData = {}) => {
  return errorResponse(message, 404, additionalData);
};

/**
 * Creates a 500 Server Error response
 * @param {string} message - Error message
 * @param {Error} error - Original error object
 * @param {Object} additionalData - Additional data to include in the response
 * @returns {NextResponse} - NextResponse object with error details
 */
export const serverErrorResponse = (message = 'Server Error', error = null, additionalData = {}) => {
  const errorData = error ? { error: error.message } : {};
  return errorResponse(message, 500, { ...errorData, ...additionalData });
};

/**
 * Creates a success response
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} status - HTTP status code
 * @returns {NextResponse} - NextResponse object with success details
 */
export const successResponse = (data = {}, message = 'Success', status = 200) => {
  return NextResponse.json(
    { 
      message, 
      ...data,
      success: true 
    }, 
    { status }
  );
};