const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/resourceController');
const { createResource, updateResource } = require('../models/resource');

module.exports = crudRouter(controller, createResource, updateResource);
