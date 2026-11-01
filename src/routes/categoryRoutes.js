const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/categoryController');
const { createCategory, updateCategory } = require('../models/category');

module.exports = crudRouter(controller, createCategory, updateCategory);
