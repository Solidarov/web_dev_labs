const prisma = require('../utils/prisma');
const crud = require('../utils/crud');
const eventBus = require('../utils/eventBus');

const isAdmin = (req) => req.user.role === 'admin';

const controller = crud('booking', undefined, (req) =>
  isAdmin(req) ? {} : { userId: req.user.id },
);

const crudUpdate = controller.update;

controller.create = async (req, res, next) => {
  try {
    const userId = (isAdmin(req) && req.body.userId) || req.user.id;
    const newBooking = await prisma.booking.create({ data: { ...req.body, userId } });
    eventBus.emit('bookingCreated', newBooking);
    res.status(201).json(newBooking);
  } catch (err) {
    next(err);
  }
};

// Non-admins cannot move a booking to another user
controller.update = (req, res, next) => {
  if (!isAdmin(req)) delete req.body.userId;
  return crudUpdate(req, res, next);
};

module.exports = controller;
