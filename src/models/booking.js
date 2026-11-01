const { z } = require('zod');

const base = z.object({
  userId: z.uuid(),
  resourceId: z.uuid(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attachments: z.any().optional(),
});

const timesValid = (b) => !b.startTime || !b.endTime || b.endTime > b.startTime;
const message = { message: 'endTime must be after startTime', path: ['endTime'] };

exports.createBooking = base.refine(timesValid, message);
exports.updateBooking = base.partial().refine(timesValid, message);
