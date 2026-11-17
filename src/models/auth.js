const { z } = require('zod');

const password = z.string().min(8);

exports.register = z.object({ email: z.email(), name: z.string().min(1), password });
exports.login = z.object({ email: z.email(), password: z.string().min(1) });
exports.refresh = z.object({ refreshToken: z.string().min(1) });
exports.changePassword = z.object({ currentPassword: z.string().min(1), newPassword: password });
exports.forgotPassword = z.object({ email: z.email() });
exports.resetPassword = z.object({ token: z.string().min(1), password });
