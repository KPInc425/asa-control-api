import { DEFAULT_TEMPLATES } from './templates.js';

/**
 * Process a message template by replacing placeholders with values
 * @param {string} template - Template string with {placeholder} syntax
 * @param {Object} data - Data object with values to substitute
 * @returns {string} Processed message
 */
export function processTemplate(template, data = {}) {
  if (!template) return '';
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
  }
  return result;
}

/**
 * Get message template for a notification type and channel
 * @param {string} type - Notification type (e.g., 'update.warning')
 * @param {string} channel - Channel name ('inGame', 'discord', 'socket')
 * @param {Object} customTemplates - Optional custom templates to override defaults
 * @returns {string} Template string
 */
export function getTemplate(type, channel, customTemplates = {}) {
  if (customTemplates[type] && customTemplates[type][channel]) {
    return customTemplates[type][channel];
  }
  if (DEFAULT_TEMPLATES[type] && DEFAULT_TEMPLATES[type][channel]) {
    return DEFAULT_TEMPLATES[type][channel];
  }
  return DEFAULT_TEMPLATES.generic[channel] || '{message}';
}

/**
 * Format message for ARK's in-game display
 * Handles special characters and length limits
 * @param {string} message - Raw message
 * @returns {string} Formatted message safe for ARK display
 */
export function formatForARK(message) {
  if (!message) return '';
  let formatted = message
    .replace(/[<>]/g, '')
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
  const maxLength = 250;
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength - 3) + '...';
  }
  return formatted;
}
