require("dotenv/config")
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const swaggerUi = require('swagger-ui-express');
const buildSpec = require('./utils/openapi');
const errorHandler = require('./utils/errorHandler');
const prisma = require('./utils/prisma');

const app = express();

app.use(express.json());
const resources = {
  users: userRoutes,
  bookings: bookingRoutes,
  resources: resourceRoutes,
  categories: categoryRoutes,
};

Object.entries(resources).forEach(([name, router]) => app.use(`/${name}`, router));

const spec = buildSpec(resources);
app.get('/docs.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;

const port = process.env.SERVER_PORT || 3000;

if (require.main === module) {
  prisma
    .$queryRaw`SELECT 1`
    .then(() => {
      console.log('Database connected');
      app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
    })
    .catch((err) => {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    });
}
