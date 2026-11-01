const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/userController');
const { createUser, updateUser } = require('../models/user');

module.exports = crudRouter(controller, createUser, updateUser);
