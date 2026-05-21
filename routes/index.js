const express = require("express");
const HealthyController = require("../controllers/HealthyController");
const SensorConfigController = require("../controllers/SensorConfigController");

const router = express.Router();

router.get("/healthy", HealthyController.handle);
router.get("/sensor-config", SensorConfigController.handle);

module.exports = router;
