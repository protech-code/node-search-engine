const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const serverless = require('serverless-http');

let handlerPromise;

async function initialize() {
  let app;
  const originalListen = express.application.listen;

  express.application.listen = function (...args) {
    app = this;
    const callback = args.find(arg => typeof arg === 'function');
    callback?.();
    return this;
  };

  try {
    const serverPath = path.join(process.cwd(), 'src', 'server.js');
    await import(pathToFileURL(serverPath).href);
  } finally {
    express.application.listen = originalListen;
  }

  if (!app) throw new Error('Không khởi tạo được Express app cho Netlify Function');
  return serverless(app);
}

exports.handler = async (event, context) => {
  handlerPromise ??= initialize();
  const handler = await handlerPromise;
  return handler(event, context);
};
