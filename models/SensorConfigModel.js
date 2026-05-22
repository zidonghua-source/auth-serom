const fs = require("fs/promises");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "sensor-config");

class SensorConfigModel {
  static async listFiles() {
    let entries;
    try {
      entries = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }

    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
      .map((e) => e.name)
      .sort();
  }

  static async getSummary() {
    const files = await this.listFiles();
    return {
      count: files.length,
      items: files.map((name, i) => ({
        index: i + 1,
        name,
      })),
    };
  }

  static async getByIndex(index) {
    const files = await this.listFiles();
    if (index < 1 || index > files.length) {
      return null;
    }

    const name = files[index - 1];
    const filePath = path.join(CONFIG_DIR, name);
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);

    return { index, name, data };
  }
}

module.exports = SensorConfigModel;
