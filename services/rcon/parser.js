import logger from '../../utils/logger.js';

export class RconParser {
  constructor(service) {
    this.service = service;
  }

  /**
   * Parse server info response with improved error handling
   */
  parseServerInfo(response) {
    try {
      if (!response || typeof response !== 'string') {
        logger.warn('Invalid server info response:', response);
        return { raw: response, error: 'Invalid response format' };
      }
      
      const lines = response.split('\n');
      const info = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          info[key] = value;
        }
      });
      
      logger.debug('Parsed server info:', info);
      return info;
    } catch (error) {
      logger.warn('Failed to parse server info response:', error);
      return { raw: response, error: error.message };
    }
  }

  /**
   * Parse player list response with improved parsing for ARK ASA format
   */
  parsePlayerList(response) {
    try {
      if (!response || typeof response !== 'string') {
        logger.warn('Invalid player list response:', response);
        return [];
      }
      
      const lines = response.split('\n');
      const players = [];
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        // Try multiple parsing patterns for ARK ASA
        let player = null;
        
        // Pattern 1: "0. PlayerName, 0002214a4a6742d9a347bd449b2dc143"
        const pattern1 = /^(\d+)\.\s+([^,]+),\s*([0-9a-fA-F]+)$/;
        const match1 = trimmedLine.match(pattern1);
        if (match1) {
          player = {
            id: match1[1],
            name: match1[2].trim(),
            steamId: match1[3]
          };
        }
        
        // Pattern 2: "Player 1: PlayerName"
        const pattern2 = /^Player\s+(\d+):\s+(.+)$/;
        const match2 = trimmedLine.match(pattern2);
        if (match2 && !player) {
          player = {
            id: match2[1],
            name: match2[2].trim()
          };
        }
        
        // Pattern 3: Just player name (fallback)
        if (!player && !trimmedLine.includes('Player') && !trimmedLine.includes('.')) {
          player = {
            id: players.length + 1,
            name: trimmedLine
          };
        }
        
        if (player) {
          players.push(player);
        }
      });
      
      logger.debug(`Parsed ${players.length} players from response:`, players);
      return players;
    } catch (error) {
      logger.warn('Failed to parse player list response:', error);
      return [];
    }
  }
}
