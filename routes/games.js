/**
 * Games Route
 *
 * Exposes which game types are registered and their capabilities/manifests
 * so the frontend can adapt its UI dynamically.
 *
 * Also provides CRUD endpoints for dynamic game definitions (admin-only).
 */
import { gameRegistry } from "../games/index.js";
import logger from "../utils/logger.js";
import { requirePermission, requireAdmin } from "../middleware/auth.js";
import {
  upsertGameDefinition,
  getGameDefinition,
  deleteGameDefinition,
} from "../services/database.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the response shape for a game adapter.
 * @param {import('../games/game-adapter.js').GameAdapter} adapter
 * @returns {object}
 */
function adapterToResponse(adapter) {
  return {
    id: adapter.id,
    name: adapter.name,
    binaryName: adapter.binaryName,
    processNames: adapter.processNames,
    steamAppId: adapter.steamAppId,
    configFiles: adapter.configFiles,
    configSubPath: adapter.configSubPath,
    defaultPorts: adapter.defaultPorts,
    dynamic: adapter.dynamic === true,
    capabilities: {
      canCluster: adapter.canCluster,
      supportsSteamWorkshop: adapter.supportsSteamWorkshop,
      supportsRcon: adapter.supportsRcon,
      supportsQuery: adapter.supportsQuery,
    },
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export default async function gamesRoutes(fastify) {
  // -----------------------------------------------------------------------
  // Read endpoints
  // -----------------------------------------------------------------------

  // List all registered game types with their info
  fastify.get(
    "/api/games",
    {
      preHandler: requirePermission("read"),
    },
    async (_request, reply) => {
      try {
        const games = gameRegistry.all.map(adapterToResponse);

        return {
          success: true,
          games,
          count: games.length,
        };
      } catch (error) {
        logger.error("Failed to list games:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to list game types",
        });
      }
    },
  );

  // Get a single game type's full adapter info
  fastify.get(
    "/api/games/:gameType",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { gameType } = request.params;
        const adapter = gameRegistry.get(gameType);

        return {
          success: true,
          game: adapterToResponse(adapter),
        };
      } catch (error) {
        logger.error(
          `Failed to get game type ${request.params.gameType}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Unknown game type",
        });
      }
    },
  );

  // -----------------------------------------------------------------------
  // Admin CRUD endpoints for dynamic game definitions
  // -----------------------------------------------------------------------

  // Create a new game definition
  fastify.post(
    "/api/games",
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      try {
        const body = request.body || {};

        // Validate required fields
        if (
          !body.game_type ||
          !body.display_name ||
          !body.binary_name ||
          !body.process_names ||
          !body.config_files
        ) {
          return reply.status(400).send({
            success: false,
            message:
              "Missing required fields: game_type, display_name, binary_name, process_names, config_files",
          });
        }

        // Upsert into DB
        upsertGameDefinition({
          game_type: body.game_type,
          display_name: body.display_name,
          binary_name: body.binary_name,
          process_names: body.process_names,
          steam_app_id: body.steam_app_id,
          config_files: body.config_files,
          config_sub_path: body.config_sub_path,
          default_game_port: body.default_game_port,
          default_query_port: body.default_query_port,
          default_rcon_port: body.default_rcon_port,
          can_cluster: body.can_cluster,
          supports_steam_workshop: body.supports_steam_workshop,
          supports_rcon: body.supports_rcon,
          supports_query: body.supports_query,
          binary_exe_relative_path: body.binary_exe_relative_path,
          install_script_template: body.install_script_template,
          start_script_template: body.start_script_template,
          stop_script_template: body.stop_script_template,
        });

        // Reload the registry so the new adapter is live
        await gameRegistry.reloadFromDb();

        const adapter = gameRegistry.get(body.game_type);
        return reply.status(201).send({
          success: true,
          message: "Game definition created",
          game: adapterToResponse(adapter),
        });
      } catch (error) {
        logger.error("Failed to create game definition:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to create game definition",
        });
      }
    },
  );

  // Update an existing game definition
  fastify.put(
    "/api/games/:gameType",
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      try {
        const { gameType } = request.params;
        const body = request.body || {};

        // Check the game exists
        const existing = getGameDefinition(gameType);
        if (!existing) {
          return reply.status(404).send({
            success: false,
            message: `Game definition "${gameType}" not found`,
          });
        }

        // Merge existing fields with provided body
        upsertGameDefinition({
          game_type: gameType,
          display_name: body.display_name ?? existing.display_name,
          binary_name: body.binary_name ?? existing.binary_name,
          process_names:
            body.process_names ?? JSON.parse(existing.process_names || "[]"),
          steam_app_id:
            body.steam_app_id !== undefined
              ? body.steam_app_id
              : existing.steam_app_id,
          config_files:
            body.config_files ?? JSON.parse(existing.config_files || "[]"),
          config_sub_path: body.config_sub_path ?? existing.config_sub_path,
          default_game_port:
            body.default_game_port ?? existing.default_game_port,
          default_query_port:
            body.default_query_port ?? existing.default_query_port,
          default_rcon_port:
            body.default_rcon_port ?? existing.default_rcon_port,
          can_cluster: body.can_cluster ?? !!existing.can_cluster,
          supports_steam_workshop:
            body.supports_steam_workshop ?? !!existing.supports_steam_workshop,
          supports_rcon: body.supports_rcon ?? !!existing.supports_rcon,
          supports_query: body.supports_query ?? !!existing.supports_query,
          binary_exe_relative_path:
            body.binary_exe_relative_path !== undefined
              ? body.binary_exe_relative_path
              : existing.binary_exe_relative_path,
          install_script_template:
            body.install_script_template !== undefined
              ? body.install_script_template
              : existing.install_script_template,
          start_script_template:
            body.start_script_template !== undefined
              ? body.start_script_template
              : existing.start_script_template,
          stop_script_template:
            body.stop_script_template !== undefined
              ? body.stop_script_template
              : existing.stop_script_template,
        });

        // Reload the registry so the adapter picks up changes
        await gameRegistry.reloadFromDb();

        const adapter = gameRegistry.get(gameType);
        return {
          success: true,
          message: "Game definition updated",
          game: adapterToResponse(adapter),
        };
      } catch (error) {
        logger.error(
          `Failed to update game definition ${request.params.gameType}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to update game definition",
        });
      }
    },
  );

  // Delete a game definition
  fastify.delete(
    "/api/games/:gameType",
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      try {
        const { gameType } = request.params;

        // Check the game exists
        const existing = getGameDefinition(gameType);
        if (!existing) {
          return reply.status(404).send({
            success: false,
            message: `Game definition "${gameType}" not found`,
          });
        }

        deleteGameDefinition(gameType);

        // Reload the registry to remove it
        await gameRegistry.reloadFromDb();

        return {
          success: true,
          message: `Game definition "${gameType}" deleted`,
        };
      } catch (error) {
        logger.error(
          `Failed to delete game definition ${request.params.gameType}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to delete game definition",
        });
      }
    },
  );
}
