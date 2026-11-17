require('dotenv/config');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const authRoutes = require('./routes/authRoutes');
const logRoutes = require('./routes/logRoutes');
const swaggerUi = require('swagger-ui-express');
const buildSpec = require('./utils/openapi');
const errorHandler = require('./utils/errorHandler');
const prisma = require('./utils/prisma');
const { globalLimiter } = require('./utils/rateLimit');
const actionLog = require('./utils/actionLog');
require('./utils/mailer'); // registers the email listeners on eventBus

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(globalLimiter);
app.use(actionLog);
app.use(express.json());
const resources = {
  users: userRoutes,
  bookings: bookingRoutes,
  resources: resourceRoutes,
  categories: categoryRoutes,
};

Object.entries(resources).forEach(([name, router]) => app.use(`/${name}`, router));
app.use('/auth', authRoutes);
app.use('/logs', logRoutes);

const spec = buildSpec(resources);
app.get('/docs.json', (req, res) => res.json(spec));
app.use(['/docs', '/api-docs'], swaggerUi.serve, swaggerUi.setup(spec));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;

const port = process.env.SERVER_PORT || 3000;

if (require.main === module) {
  prisma.$queryRaw`SELECT 1`
    .then(() => {
      console.log('Database connected');
      app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
    })
    .catch((err) => {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    });
}
