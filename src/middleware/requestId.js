// ===========================================
// Middleware: Request ID (trazabilidad)
// Uses Node's built-in crypto.randomUUID() when available to avoid
// importing the ESM-only `uuid` package which can break CommonJS apps.
// ===========================================
const crypto = require('crypto');

function generateRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: deterministic-ish short id if randomUUID is not available
  return 'rid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('x-request-id', req.requestId);
  next();
}

module.exports = requestId;
