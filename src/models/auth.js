const { z } = require('zod');

const password = z.string().min(8);
const email = 'anna@example.com';
const token = '9f2c4e7a1b3d5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4';

exports.register = z
  .object({ email: z.email(), name: z.string().min(1), password })
  .meta({ example: { email, name: 'Anna Koval', password: 'secret123' } });
exports.login = z
  .object({ email: z.email(), password: z.string().min(1) })
  .meta({ example: { email, password: 'secret123' } });
exports.refresh = z
  .object({ refreshToken: z.string().min(1) })
  .meta({ example: { refreshToken: token } });
exports.changePassword = z
  .object({ currentPassword: z.string().min(1), newPassword: password })
  .meta({ example: { currentPassword: 'secret123', newPassword: 'newSecret456' } });
exports.forgotPassword = z.object({ email: z.email() }).meta({ example: { email } });
exports.resetPassword = z
  .object({ token: z.string().min(1), password })
  .meta({ example: { token, password: 'newSecret456' } });
