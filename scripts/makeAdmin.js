require('dotenv/config');
const prisma = require('../src/utils/prisma');

const email = process.argv[2];
if (!email) throw new Error('Usage: npm run make-admin -- <email>');

prisma.user
  .update({ where: { email }, data: { role: 'admin' } })
  .then((user) => console.log(`${user.email} is now ${user.role}`))
  .catch((err) => {
    console.error(err.code === 'P2025' ? 'User not found' : err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
