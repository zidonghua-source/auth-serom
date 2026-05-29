const express = require("express");
const HealthyController = require("../controllers/HealthyController");
const SensorConfigController = require("../controllers/SensorConfigController");
const SensorShowController = require("../controllers/SensorShowController");

const router = express.Router();

router.get("/healthy", HealthyController.handle);
router.get("/sensor-config", SensorConfigController.handle);

router.get("/sensor-show", SensorShowController.showPage);
router.get("/sensor-show/api/files", SensorShowController.listFiles);
router.get("/sensor-show/api/info", SensorShowController.getInfo);
router.get("/sensor-show/api/series", SensorShowController.getSeries);

module.exports = router;
