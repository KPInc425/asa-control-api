import logger from "../../utils/logger.js";

export class IniParserModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Parse INI file content
   */
  parseIniContent(content) {
    try {
      const lines = content.split("\n");
      const sections = {};
      let currentSection = "default";

      lines.forEach((line) => {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
          currentSection = trimmedLine.slice(1, -1);
          sections[currentSection] = {};
        } else if (trimmedLine.includes("=") && !trimmedLine.startsWith(";")) {
          const [key, ...valueParts] = trimmedLine.split("=");
          const value = valueParts.join("=").trim();

          if (!sections[currentSection]) {
            sections[currentSection] = {};
          }

          sections[currentSection][key.trim()] = value;
        }
      });

      return sections;
    } catch (error) {
      logger.warn("Error parsing INI content:", error);
      return { raw: content };
    }
  }

  /**
   * Convert parsed INI back to string
   */
  stringifyIniContent(parsedContent) {
    try {
      let content = "";

      Object.entries(parsedContent).forEach(([section, items]) => {
        if (section !== "default") {
          content += `[${section}]\n`;
        }

        Object.entries(items).forEach(([key, value]) => {
          content += `${key}=${value}\n`;
        });

        content += "\n";
      });

      return content.trim();
    } catch (error) {
      logger.warn("Error stringifying INI content:", error);
      throw new Error("Failed to convert INI content to string");
    }
  }
}
