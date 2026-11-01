const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/bookingController');
const { createBooking, updateBooking } = require('../models/booking');

module.exports = crudRouter(controller, createBooking, updateBooking);
