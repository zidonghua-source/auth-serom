const SensorConfigModel = require("../models/SensorConfigModel");
const { sendOk, sendError } = require("../utils/response");

class SensorConfigController {
  static async handle(req, res) {
    const indexParam = req.query.index ?? req.query.stt;

    try {
      if (indexParam === undefined || indexParam === "") {
        const summary = await SensorConfigModel.getSummary();
        return sendOk(res, {
          count: summary.count,
          items: summary.items,
        });
      }

      const index = Number(indexParam);
      if (!Number.isInteger(index) || index < 1) {
        return sendError(
          res,
          "Query index (or stt) must be a positive integer starting from 1"
        );
      }

      const config = await SensorConfigModel.getByIndex(index);
      if (!config) {
        const summary = await SensorConfigModel.getSummary();
        return sendError(res, `Config index ${index} not found`, {
          count: summary.count,
        });
      }

      return sendOk(res, {
        index: config.index,
        name: config.name,
        data: config.data,
      });
    } catch (err) {
      console.error("[SensorConfigController]", err);
      return sendError(res, "Failed to load sensor config");
    }
  }
}

module.exports = SensorConfigController;
