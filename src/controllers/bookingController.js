const { z } = require('zod');
const prisma = require('../utils/prisma');
const crud = require('../utils/crud');
const eventBus = require('../utils/eventBus');

const isAdmin = (req) => req.user.role === 'admin';

// userId filter is AND-ed with the scope, so non-admins still only see their own bookings
const controller = crud('booking', undefined, {
  scope: (req) => (isAdmin(req) ? {} : { userId: req.user.id }),
  sort: ['startTime', 'endTime'],
  filters: {
    resourceId: (id) => ({ resourceId: z.uuid().parse(id) }),
    userId: (id) => ({ userId: z.uuid().parse(id) }),
    from: (from) => ({ startTime: { gte: z.coerce.date().parse(from) } }),
    to: (to) => ({ endTime: { lte: z.coerce.date().parse(to) } }),
  },
});

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
