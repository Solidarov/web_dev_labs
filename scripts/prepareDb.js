require('dotenv/config');
const { execSync } = require('node:child_process');

const isTest = process.argv[2] === 'test';
const service = isTest ? 'test_db' : 'dev_db';
const url = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

execSync(`docker compose up -d --wait ${service}`, { stdio: 'inherit' });
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
