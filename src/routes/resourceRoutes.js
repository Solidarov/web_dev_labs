const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/resourceController');
const { createResource, updateResource } = require('../models/resource');
const { authenticate, authorize } = require('../utils/auth');

module.exports = crudRouter(controller, createResource, updateResource, {
  write: [authenticate, authorize('admin')],
});
