const DeviceModel = require("../models/DeviceModel");
const TelegramService = require("../services/TelegramService");
const { sendOk, sendError } = require("../utils/response");

class HealthyController {
  static async handle(req, res) {
    const { sn, imei, stid } = req.query;

    if (!sn) {
      return sendError(res, "Missing required query: sn");
    }

    try {
      const { isNew } = await DeviceModel.upsert({ sn, imei, stid });
      TelegramService.notifyHealthy({ sn, imei, stid, isNew });

      const device = await DeviceModel.findBySn(sn);
      return sendOk(res, {
        sn: device.sn,
        imei: device.imei,
        stid: device.stid,
        created_at: device.created_at,
        updated_at: device.updated_at,
        is_new: isNew,
      });
    } catch (err) {
      console.error("[HealthyController]", err);
      return sendError(res, "Internal server error");
    }
  }
}

module.exports = HealthyController;
