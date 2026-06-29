import sessionRoutes from './session.js';
import profileRoutes from './profile.js';
import passwordRoutes from './password.js';
import emailRoutes from './email.js';
import userManagementRoutes from './users.js';
import validationRoutes from './validation.js';
import setupRoutes from './setup.js';

/**
 * Enhanced Authentication routes — aggregates all auth sub-modules
 */
export default async function enhancedAuthRoutes(fastify, options) {
  await fastify.register(sessionRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(passwordRoutes);
  await fastify.register(emailRoutes);
  await fastify.register(userManagementRoutes);
  await fastify.register(validationRoutes);
  await fastify.register(setupRoutes);
}
