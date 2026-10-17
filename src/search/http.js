// Client HTTP JSON nhỏ cho các engine REST (OpenSearch, Elasticsearch, Typesense).
import fs from 'node:fs';
import { Agent, request } from 'undici';
import { EngineError } from './errors.js';

export function createHttp({ provider, baseUrl, headers = {}, caPath, timeout = 20000 }) {
  const agent = new Agent({
    connect: { timeout: 10000, ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}) },
  });
  const base = String(baseUrl).replace(/\/+$/, '');

  async function api(method, path, body, { query, ok404 = false } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const res = await request(base + path + qs, {
      method, dispatcher: agent,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headersTimeout: timeout, bodyTimeout: timeout,
    });
    const text = await res.body.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (res.statusCode >= 400 && !(ok404 && res.statusCode === 404)) throw new EngineError(res.statusCode, json, provider);
    return { status: res.statusCode, body: json };
  }
  return { api };
}
