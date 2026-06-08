#!/usr/bin/env node
// Called by Render cron service every 5 minutes
const https = require('https');

function post(path) {
  const url = new URL(process.env.API_URL + path);
  const req = https.request(url, { method: 'POST', headers: { 'x-api-key': process.env.CRON_API_KEY } }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => console.log(path, res.statusCode, body.slice(0, 200)));
  });
  req.on('error', (e) => console.error(path, 'failed:', e.message));
  req.end();
}

post('/cron/sync');
post('/cron/score');
