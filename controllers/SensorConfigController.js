const SensorConfigModel = require("../models/SensorConfigModel");

class SensorConfigController {
  static async handle(req, res) {
    try {
      const config = await SensorConfigModel.loadMerged();
      return res.json(config);
    } catch (err) {
      console.error("[SensorConfigController]", err);
      return res.status(500).json({ ok: false, error: "Failed to load sensor config" });
    }
  }
}

module.exports = SensorConfigController;
