const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/bookingController');
const { createBooking, updateBooking } = require('../models/booking');
const { authenticate } = require('../utils/auth');

module.exports = crudRouter(controller, createBooking, updateBooking, {
  read: [authenticate],
  write: [authenticate],
});
