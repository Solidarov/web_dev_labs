const crud = require('../utils/crud');

module.exports = crud('category', undefined, { search: ['name'], sort: ['name'] });
