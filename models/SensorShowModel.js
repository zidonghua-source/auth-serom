const fs = require("fs/promises");
const path = require("path");
const SensorConfigModel = require("./SensorConfigModel");

const CONFIG_DIR = path.join(__dirname, "..", "sensor-config");
const SKIP_SENSORS = new Set(["Metadata", "Annotation"]);
const META_FIELDS = new Set(["sensor", "time", "seconds_elapsed"]);

const cache = new Map();

function toRecords(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function isSensorLoggerRecord(record) {
  return (
    record &&
    typeof record === "object" &&
    !Array.isArray(record) &&
    typeof record.sensor === "string"
  );
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

class SensorShowModel {
  static async loadFile(index) {
    const config = await SensorConfigModel.getByIndex(index);
    if (!config) return null;

    const filePath = path.join(CONFIG_DIR, config.name);
    const stat = await fs.stat(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return { ...cached.payload, index: config.index, name: config.name };
    }

    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const records = toRecords(data);
    const supported = records.some(isSensorLoggerRecord);

    const payload = {
      index: config.index,
      name: config.name,
      supported,
      recordCount: records.length,
      metadata: supported ? this.extractMetadata(records) : null,
      sensors: supported ? this.listSensors(records) : [],
    };

    cache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      payload: { records, ...payload },
    });

    return payload;
  }

  static extractMetadata(records) {
    const meta = {};
    for (const row of records) {
      if (row.sensor !== "Metadata") continue;
      Object.assign(meta, row);
    }
    delete meta.sensor;
    return meta;
  }

  static listSensors(records) {
    const counts = new Map();
    for (const row of records) {
      if (!isSensorLoggerRecord(row) || SKIP_SENSORS.has(row.sensor)) continue;
      counts.set(row.sensor, (counts.get(row.sensor) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  static numericFields(sample) {
    return Object.keys(sample).filter((key) => {
      if (META_FIELDS.has(key)) return false;
      const value = sample[key];
      if (value === "" || value == null) return false;
      const num = Number(value);
      return Number.isFinite(num);
    });
  }

  static async getSeries(index, sensorName, maxPoints = 2000) {
    const config = await SensorConfigModel.getByIndex(index);
    if (!config) return null;

    const filePath = path.join(CONFIG_DIR, config.name);
    const stat = await fs.stat(filePath);
    let entry = cache.get(filePath);

    if (!entry || entry.mtimeMs !== stat.mtimeMs) {
      await this.loadFile(index);
      entry = cache.get(filePath);
    }

    const { records, supported } = entry.payload;
    if (!supported) {
      return { supported: false, error: "File is not in Sensor Logger JSON export format" };
    }

    const filtered = records.filter((r) => r.sensor === sensorName);
    if (filtered.length === 0) {
      return { supported: true, sensor: sensorName, fields: [], labels: [], datasets: [] };
    }

    const fields = this.numericFields(filtered[0]);
    const points = filtered.map((row) => {
      const t = Number(row.seconds_elapsed);
      const point = { t: Number.isFinite(t) ? t : 0 };
      for (const field of fields) {
        point[field] = Number(row[field]);
      }
      return point;
    });

    const sampled = downsample(points, maxPoints);
    const labels = sampled.map((p) => p.t);
    const datasets = fields.map((field) => ({
      field,
      data: sampled.map((p) => p[field]),
    }));

    return {
      supported: true,
      sensor: sensorName,
      totalPoints: filtered.length,
      displayedPoints: sampled.length,
      fields,
      labels,
      datasets,
    };
  }
}

module.exports = SensorShowModel;
