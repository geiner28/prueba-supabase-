// ===========================================
// Middleware: Autenticación (Bot / Admin)
// ===========================================
const config = require("../config");
const { errors } = require("../utils/response");

/**
 * Verifica x-bot-api-key
 */
function authBot(req, res, next) {
  const key = req.headers["x-bot-api-key"];
  if (!key || key !== config.auth.botApiKey) {
    const err = errors.unauthorized("API Key del bot inválida o ausente");
    return res.status(err.statusCode).json(err.body);
  }
  req.actorTipo = "bot";
  next();
}

/**
 * Verifica x-admin-api-key
 */
function authAdmin(req, res, next) {
  const key = req.headers["x-admin-api-key"];
  if (!key || key !== config.auth.adminApiKey) {
    const err = errors.unauthorized("API Key de admin inválida o ausente");
    return res.status(err.statusCode).json(err.body);
  }
  req.actorTipo = "admin";
  req.adminId = req.headers["x-admin-id"] || null; // UUID del admin si se envía
  next();
}

/**
 * Acepta bot O admin
 */
function authBotOrAdmin(req, res, next) {
  const botKey = req.headers["x-bot-api-key"];
  const adminKey = req.headers["x-admin-api-key"];

  if (botKey && botKey === config.auth.botApiKey) {
    req.actorTipo = "bot";
    return next();
  }
  if (adminKey && adminKey === config.auth.adminApiKey) {
    req.actorTipo = "admin";
    req.adminId = req.headers["x-admin-id"] || null;
    return next();
  }

  const err = errors.unauthorized("API Key inválida o ausente");
  return res.status(err.statusCode).json(err.body);
}

/**
 * Acepta admin O sistema (para pagos)
 */
function authAdminOrSystem(req, res, next) {
  const adminKey = req.headers["x-admin-api-key"];
  const botKey = req.headers["x-bot-api-key"];

  if (adminKey && adminKey === config.auth.adminApiKey) {
    req.actorTipo = "admin";
    req.adminId = req.headers["x-admin-id"] || null;
    return next();
  }
  // Sistema puede usar bot key internamente
  if (botKey && botKey === config.auth.botApiKey) {
    req.actorTipo = "sistema";
    return next();
  }

  const err = errors.unauthorized("API Key inválida o ausente");
  return res.status(err.statusCode).json(err.body);
}

module.exports = { authBot, authAdmin, authBotOrAdmin, authAdminOrSystem };
