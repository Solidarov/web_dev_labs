const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/userController');
const { createUser, updateUser } = require('../models/user');
const { authenticate, authorize } = require('../utils/auth');

const adminOnly = [authenticate, authorize('admin')];

module.exports = crudRouter(controller, createUser, updateUser, {
  read: adminOnly,
  write: adminOnly,
});
