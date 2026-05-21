const { getPool } = require("../config/database");

class DeviceModel {
  static async upsert({ sn, imei, stid }) {
    const [result] = await getPool().execute(
      `INSERT INTO devices (sn, imei, stid)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         imei = VALUES(imei),
         stid = VALUES(stid),
         updated_at = CURRENT_TIMESTAMP`,
      [sn, imei ?? null, stid ?? null]
    );

    return { isNew: result.affectedRows === 1 };
  }

  static async findBySn(sn) {
    const [rows] = await getPool().execute(
      `SELECT sn, imei, stid, created_at, updated_at FROM devices WHERE sn = ?`,
      [sn]
    );
    return rows[0] ?? null;
  }
}

module.exports = DeviceModel;
