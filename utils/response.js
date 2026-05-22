function sendOk(res, data = {}) {
  return res.status(200).json({ status: "ok", ...data });
}

function sendError(res, error, data = {}) {
  return res.status(200).json({ status: "error", error, ...data });
}

module.exports = { sendOk, sendError };
