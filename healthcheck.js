// Docker HEALTHCHECK probe — avoids needing curl/wget in the runtime image.
'use strict';
const http = require('http');

const request = http.get(
  { host: '127.0.0.1', port: process.env.PORT || 3000, path: '/health', timeout: 4000 },
  (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  },
);
request.on('error', () => process.exit(1));
request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});
