// ===========================================
// DeOne Backend - Express App
// ===========================================
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const requestId = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");

// Routes
const usersRoutes = require("./modules/users/users.routes");
const obligacionesRoutes = require("./modules/obligaciones/obligaciones.routes");
const facturasRoutes = require("./modules/facturas/facturas.routes");
const recargasRoutes = require("./modules/recargas/recargas.routes");
const revisionesRoutes = require("./modules/revisiones/revisiones.routes");
const disponibilidadRoutes = require("./modules/disponibilidad/disponibilidad.routes");
const pagosRoutes = require("./modules/pagos/pagos.routes");

const app = express();

// ===========================================
// Middleware Global
// ===========================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(requestId);
app.use(morgan(":method :url :status :response-time ms - :req[x-request-id]"));

// ===========================================
// Frontend estático (Admin Panel)
// ===========================================
app.use(express.static(path.join(__dirname, "..", "public")));

// ===========================================
// Health Check
// ===========================================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    data: {
      service: "DeOne Backend",
      status: "running",
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});

// ===========================================
// Rutas de Módulos
// ===========================================
app.use("/api/users", usersRoutes);
app.use("/api/obligaciones", obligacionesRoutes);
app.use("/api/facturas", facturasRoutes);
app.use("/api/recargas", recargasRoutes);
app.use("/api/revisiones", revisionesRoutes);
app.use("/api/disponible", disponibilidadRoutes);
app.use("/api/pagos", pagosRoutes);

// ===========================================
// 404
// ===========================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    data: null,
    error: { code: "NOT_FOUND", message: `Ruta ${req.method} ${req.path} no encontrada` },
  });
});

// ===========================================
// Error Handler Central
// ===========================================
app.use(errorHandler);

module.exports = app;
