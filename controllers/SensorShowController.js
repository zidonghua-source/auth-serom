const path = require("path");
const fs = require("fs/promises");
const SensorConfigModel = require("../models/SensorConfigModel");
const SensorShowModel = require("../models/SensorShowModel");
const { sendOk, sendError } = require("../utils/response");

const PAGE_PATH = path.join(__dirname, "..", "public", "sensor-show.html");

const CHART_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
];

class SensorShowController {
  static async showPage(req, res) {
    try {
      const html = await fs.readFile(PAGE_PATH, "utf8");
      res.type("html").send(html);
    } catch (err) {
      console.error("[SensorShowController.showPage]", err);
      res.status(500).send("Failed to load sensor show page");
    }
  }

  static async listFiles(req, res) {
    try {
      const summary = await SensorConfigModel.getSummary();
      return sendOk(res, summary);
    } catch (err) {
      console.error("[SensorShowController.listFiles]", err);
      return sendError(res, "Failed to list sensor config files");
    }
  }

  static async getInfo(req, res) {
    const index = Number(req.query.index);
    if (!Number.isInteger(index) || index < 1) {
      return sendError(res, "Query index must be a positive integer starting from 1");
    }

    try {
      const info = await SensorShowModel.loadFile(index);
      if (!info) {
        return sendError(res, `Config index ${index} not found`);
      }

      const { records, ...rest } = info;
      return sendOk(res, rest);
    } catch (err) {
      console.error("[SensorShowController.getInfo]", err);
      return sendError(res, "Failed to load sensor file info");
    }
  }

  static async getSeries(req, res) {
    const index = Number(req.query.index);
    const sensor = req.query.sensor;
    const maxPoints = Math.min(
      5000,
      Math.max(100, Number(req.query.maxPoints) || 2000)
    );

    if (!Number.isInteger(index) || index < 1) {
      return sendError(res, "Query index must be a positive integer starting from 1");
    }
    if (!sensor) {
      return sendError(res, "Query sensor is required");
    }

    try {
      const series = await SensorShowModel.getSeries(index, sensor, maxPoints);
      if (!series) {
        return sendError(res, `Config index ${index} not found`);
      }
      if (!series.supported) {
        return sendError(res, series.error);
      }

      return sendOk(res, {
        ...series,
        colors: CHART_COLORS,
      });
    } catch (err) {
      console.error("[SensorShowController.getSeries]", err);
      return sendError(res, "Failed to load sensor series");
    }
  }
}

module.exports = SensorShowController;
