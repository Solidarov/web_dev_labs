const { z } = require('zod');

const base = z.object({
  userId: z.uuid().optional(),
  resourceId: z.uuid(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

const timesValid = (b) => !b.startTime || !b.endTime || b.endTime > b.startTime;
const message = { message: 'endTime must be after startTime', path: ['endTime'] };

const example = {
  resourceId: '3f6c2a9e-8b1d-4e7a-9c25-1d4b7e0f6a83',
  startTime: '2030-01-15T10:00:00.000Z',
  endTime: '2030-01-15T11:30:00.000Z',
};

exports.createBooking = base.refine(timesValid, message).meta({ example });
exports.updateBooking = base
  .partial()
  .refine(timesValid, message)
  .meta({ example: { endTime: '2030-01-15T12:00:00.000Z' } });
