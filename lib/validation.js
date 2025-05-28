/**
 * Form validation utilities for client-side validation
 */

/**
 * Validates an email address
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid, false otherwise
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates a password
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum password length (default: 8)
 * @param {boolean} options.requireUppercase - Require at least one uppercase letter (default: true)
 * @param {boolean} options.requireLowercase - Require at least one lowercase letter (default: true)
 * @param {boolean} options.requireNumbers - Require at least one number (default: true)
 * @param {boolean} options.requireSpecialChars - Require at least one special character (default: true)
 * @returns {Object} - Validation result with isValid and message properties
 */
export const validatePassword = (password, options = {}) => {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true,
  } = options;

  if (!password) {
    return { isValid: false, message: 'Password is required' };
  }

  if (password.length < minLength) {
    return { isValid: false, message: `Password must be at least ${minLength} characters long` };
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (requireNumbers && !/\d/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one number' };
  }

  if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one special character' };
  }

  return { isValid: true, message: 'Password is valid' };
};

/**
 * Validates login form data
 * @param {Object} data - Form data
 * @param {string} data.email - Email address
 * @param {string} data.password - Password
 * @returns {Object} - Validation result with isValid and errors properties
 */
export const validateLoginForm = (data) => {
  const { email, password } = data;
  const errors = {};

  if (!email) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validates registration form data
 * @param {Object} data - Form data
 * @param {string} data.name - User's name
 * @param {string} data.email - Email address
 * @param {string} data.password - Password
 * @param {string} data.confirmPassword - Password confirmation
 * @returns {Object} - Validation result with isValid and errors properties
 */
export const validateRegisterForm = (data) => {
  const { name, email, password, confirmPassword } = data;
  const errors = {};

  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters long';
  }

  if (!email) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Please enter a valid email address';
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.message;
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};