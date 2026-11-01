const prisma = require('../utils/prisma');
const crud = require('../utils/crud');
const eventBus = require('../utils/eventBus');

const controller = crud('booking');

controller.create = async (req, res, next) => {
  try {
    const newBooking = await prisma.booking.create({ data: req.body });
    eventBus.emit('bookingCreated', newBooking);
    res.status(201).json(newBooking);
  } catch (err) {
    next(err);
  }
};

module.exports = controller;
