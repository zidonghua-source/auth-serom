const DeviceModel = require("../models/DeviceModel");
const TelegramService = require("../services/TelegramService");

class HealthyController {
  static async handle(req, res) {
    const { sn, imei, stid } = req.query;

    if (!sn) {
      return res.status(400).json({ ok: false, error: "Missing required query: sn" });
    }

    try {
      const { isNew } = await DeviceModel.upsert({ sn, imei, stid });
      TelegramService.notifyHealthy({ sn, imei, stid, isNew });

      const device = await DeviceModel.findBySn(sn);
      return res.json({
        ok: true,
        sn: device.sn,
        imei: device.imei,
        stid: device.stid,
        created_at: device.created_at,
        updated_at: device.updated_at,
        is_new: isNew,
      });
    } catch (err) {
      console.error("[HealthyController]", err);
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  }
}

module.exports = HealthyController;
