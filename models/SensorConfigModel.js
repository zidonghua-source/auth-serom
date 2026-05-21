const fs = require("fs/promises");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "sensor-config");

class SensorConfigModel {
  static async loadMerged() {
    let entries;
    try {
      entries = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return {};
      throw err;
    }

    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
      .map((e) => e.name)
      .sort();

    const merged = {};
    for (const file of jsonFiles) {
      const filePath = path.join(CONFIG_DIR, file);
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        Object.assign(merged, data);
      } else {
        merged[file.replace(/\.json$/i, "")] = data;
      }
    }

    return merged;
  }
}

module.exports = SensorConfigModel;
