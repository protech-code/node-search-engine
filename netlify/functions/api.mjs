import express from 'express';
import serverless from 'serverless-http';

let app;
const originalListen = express.application.listen;

// Reuse the existing app bootstrap without opening a persistent HTTP listener.
express.application.listen = function (...args) {
  app = this;
  const callback = args.find(arg => typeof arg === 'function');
  callback?.();
  return this;
};

try {
  await import('../../src/server.js');
} finally {
  express.application.listen = originalListen;
}

if (!app) throw new Error('Không khởi tạo được Express app cho Netlify Function');

export const handler = serverless(app);
