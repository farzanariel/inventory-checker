# Discovered API

**Base URL:** `https://www.bestbuy.com`

## Quick start

```js
import { get_gateway_graphql_fulfillment } from './client.mjs';
```

**1 functions**, zero dependencies. See [`client.mjs`](./client.mjs) for full signatures.

## Endpoints

| Method | Path | Samples | Statuses | Confidence |
|---|---|---|---|---|
| GET | `/gateway/graphql/fulfillment` | 16 | 200 | low |

### `GET /gateway/graphql/fulfillment`

<details><summary>Example response</summary>

```json
{
  "data": {
    "fulfillmentOptions": {
      "__typename": "FulfillmentOptionsList",
      "buttonStates": [
        {
          "__typename": "ButtonState",
          "buttonState": "ADD_TO_CART",
          "condition": "NEW",
          "displayText": "Add to Cart",
          "fulfillmentOption": "SHIPPING",
          "hyperlinkUrl": null,
          "planButtonState": null,
          "planDisplayText": null,
          "secondaryButtonState": null,
          "secondaryDisplayText": null,
          "skuId": "6674708"
        }
      ],
      "deliveryDetails": [
        {
          "__typename": "FulfillmentDeliveryDetail",
          "deliveryAvailability": [
            {
              "__typename": "FulfillmentDeliveryAvailability",
              "condition": "NEW",
              "backordered": null,
              "deliverable": null,
              "deliveryEligible": null,
              "deliveryServices": null,
              "deliverySlots": null,
              "forceSkipScheduli
  ...
}
```
</details>

## Coverage

- **1** API endpoints discovered

