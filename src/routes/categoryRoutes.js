const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/categoryController');
const { createCategory, updateCategory } = require('../models/category');
const { authenticate, authorize } = require('../utils/auth');

module.exports = crudRouter(controller, createCategory, updateCategory, {
  write: [authenticate, authorize('admin')],
});
