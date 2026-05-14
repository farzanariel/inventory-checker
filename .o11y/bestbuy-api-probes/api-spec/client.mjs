// Auto-generated API client from browser-trace capture.
// Usage: import {  } from './client.mjs';

const BASE = 'https://api.bestbuy.com';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

async function request(path, { method = 'GET', body, query, headers } = {}) {
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null));
    if (qs.toString()) url += '?' + qs;
  }
  const res = await fetch(url, {
    method,
    headers: { ...defaultHeaders, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

export async function getv1_products_6674708_json(options = {}) {
  return request('/v1/products/6674708.json', {
    method: 'GET',
    ...options,
  });
}

export async function getv1_products_sku_6674708_(options = {}) {
  return request('/v1/products(sku=6674708)', {
    method: 'GET',
    ...options,
  });
}

export async function getv1_products_id_stores_json(options = {}) {
  return request('/v1/products/{id}/stores.json', {
    method: 'GET',
    ...options,
  });
}

export async function getv1_products_id_alsoViewed(options = {}) {
  return request('/v1/products/{id}/alsoViewed', {
    method: 'GET',
    ...options,
  });
}

export async function getbeta_products_id_openBox(options = {}) {
  return request('/beta/products/{id}/openBox', {
    method: 'GET',
    ...options,
  });
}

