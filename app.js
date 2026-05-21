const express = require("express");
const routes = require("./routes");

function createApp() {
  const app = express();
  app.use(routes);
  return app;
}

module.exports = createApp;
