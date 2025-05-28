/**
 * Utility functions for Prisma operations
 */


import {Logger} from "./logger.js";

/**
 * Retries a Prisma operation that might encounter transaction conflicts
 * @param {Function} operation - The Prisma operation to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds before retrying
 * @returns {Promise<any>} - The result of the operation
 */
const retryOperation = async (operation, maxRetries = 3, initialDelay = 100) => {
    let retries = maxRetries;
    let delay = initialDelay;

    while (retries > 0) {
        try {
            return await operation();
        } catch (error) {
            // If it's a transaction conflict (P2034) and we have retries left
            if (error.code === 'P2034' && retries > 0) {
                // Log transaction conflict with retry information
                Logger.debug(`Transaction conflict. Retrying...`, { retries, delay });
                // Wait for the specified delay
                await new Promise(resolve => setTimeout(resolve, delay));
                // Decrease retries and increase delay for next attempt
                retries--;
                delay *= 2; // Exponential backoff
            } else {
                // If it's not a transaction conflict or we're out of retries, throw the error
                throw error;
            }
        }
    }

    throw new Error('Operation failed after maximum retry attempts');
};

export { retryOperation };
