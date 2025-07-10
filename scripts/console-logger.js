/**
 * Simple console logger for interactive console
 * This avoids conflicts with the backend API logger
 */

class ConsoleLogger {
  info(message) {
    console.log(`[INFO] ${message}`);
  }
  
  warn(message) {
    console.log(`[WARN] ${message}`);
  }
  
  error(message) {
    console.error(`[ERROR] ${message}`);
  }
  
  debug(message) {
    // Debug messages are silent in console mode
  }
}

export default new ConsoleLogger(); 
