# Discovered API

**Base URL:** `https://api.bestbuy.com`

## Quick start

```js
import { get_v1_products_6674708_json, get_v1_products_sku_6674708_, get_v1_products_id_stores_json, get_v1_products_id_alsoViewed, get_beta_products_id_openBox } from './client.mjs';
```

**5 functions**, zero dependencies. See [`client.mjs`](./client.mjs) for full signatures.

## Endpoints

| Method | Path | Samples | Statuses | Confidence |
|---|---|---|---|---|
| GET | `/v1/products/6674708.json` | 1 | 403 | low |
| GET | `/v1/products(sku=6674708)` | 1 | 403 | low |
| GET | `/v1/products/{id}/stores.json` | 1 | 403 | low |
| GET | `/v1/products/{id}/alsoViewed` | 1 | 403 | low |
| GET | `/beta/products/{id}/openBox` | 1 | 403 | low |

## Coverage

- **5** API endpoints discovered
- **5** observed only once

