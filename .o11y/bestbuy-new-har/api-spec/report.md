# Discovered API

**Base URL:** `https://www.bestbuy.com`

## Quick start

```js
import { getBbyApolloClientInternalConfig, customerData, cartQuery, pageLoadAnalyticsData_Init_Pdp, getSpotlightAd, myQuery, managedContentByTypeAndId, warrantySelector_CustomerPriceAndButtonState, accessoriesInVariations_ConfigData, getCompareProduct, recommendationsComponentExperienceQuery, __unknown__, bBYServiceWorkerConfig, warrantySelector_AssociatedWarranties, accessoriesInVariations_FetchData, reviewStats_Init, getProduct, addToCart_FulfillmentDynamicQuery, customerVisitorOfferQuery, ratingsAndReviewsRequiredData, aIV_FulfillmentBatchCall, getZipCodeByLocationId, customerDataQuery, getLocationsByZipCode, bestMediaV3PdpSbb, pVFulfillmentBatchCall_Init, getPDPProductBySkuId, getProductDetail, giftCard_GWPSiteControlTimeline, priceExperience_OfferListSiteControlTimeline, priceBlock_OffersContentForProductQuery, getMediationLayerForNonPLP, getProductHierarchyIdBySkuId, productCarousels_FulfillmentBatchCall, uRE_FetchRecommendations, uRE_FetchButtonStates, get__assets_bby__com_libs_goteam_v26_16_2_js, get_deo_configfile_v1_configfiles, post_ugc_v1_write_a_review, get_gateway_graphql_fulfillment, post_streams_v1_consume, get_api_tcfb_model_json, get_streams_v1_SEARCH_TERM, post_awacs_ingestor_api_cload, post_awacs_ingestor_api_airport, post_awacs_ingestor_api_unfilled, post_services_conversation_web_api_v1_unified_chat_logger } from './client.mjs';
```

**47 functions**, zero dependencies. See [`client.mjs`](./client.mjs) for full signatures.

## Operations

These are logical operations multiplexed over a single endpoint.

### ReviewStats_Init

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "ReviewStats_Init"`
- **Samples:** 17 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "ReviewStats_Init",
  "variables": {
    "skuId": "6576719"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query ReviewStats_Init($skuId: String!, $openBoxCondition: Int) {\n  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {\n    ...ReviewStats_Fragment\n    __typename\n    skuId\n    openBoxCondition\n  }\n}\n\nfragment ReviewStats_Fragment on Product {\n  skuId\n  orderCode\n  reviewInfo {\n    averageRating\n    reviewCount\n    syndicatedReviewSummary {\n      clientDisplayName\n      overallRating\n      totalReviewCount\n      displayLink\n      __typename\n    }\n    __typename\n  }\n  url {\n    relativePdp\n    skuSpecificUrl\n    __typename\n  }\n  name {\n    short\n    __typename\n  }\n  __typename\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6576719"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "skuId": "6576719",
      "orderCode": "4",
      "reviewInfo": {
        "averageRating": 4.5,
        "reviewCount": 580,
        "syndicatedReviewSummary": [],
        "__typename": "ProductReviewInfo"
      },
      "url": {
        "relativePdp": "/product/dell-inspiron-14-14-2k-2-in-1-touchscreen-laptop-amd-ryzen-5-8640hs-2023-8gb-memory-512-gb-storage-midnight-blue/J3K4L6JSFL",
        "skuSpecificUrl": "https://www.bestbuy.com/product/dell-inspiron-14-14-2k-2-in-1-touchscreen-laptop-amd-ryzen-5-8640hs-2023-8gb-memory-512-gb-storage-midnight-blue/J3K4L6JSFL/sku/6576719",
        "__typename": "ProductUrl"
      },
      "name": {
        "short": "Dell - Inspiron 14 - 14\" 2K 2-in-1 Touchscreen Laptop - AMD Ryzen 5 8640HS 2023 - 8GB Memory - 512 GB Storage - Midnight Blue",
        "__typename": "ProductName"
      },
      "__typename": "Product",
      "openBoxCondition": null
    }
  }
}
```
</details>

### getProduct

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getProduct"`
- **Samples:** 8 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "getProduct",
  "variables": {
    "skuId": "6576719"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query getProduct($skuId: String!, $openBoxCondition: Int) {\n  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {\n    ...priceXProductFragment\n    __typename\n    skuId\n    openBoxCondition\n  }\n}\n\nfragment priceXProductFragment on Product {\n  skuId\n  buyingOptions {\n    __typename\n    pdpUrl\n    type\n  }\n  termLength {\n    __typename\n    unitOfMeasure\n    value\n  }\n  name {\n    short\n    __typename\n  }\n  primaryImage {\n    piscesHref\n    __typename\n  }\n  price(\n    input: {salesChannel: \"LargeView\", usePriceWithCart: true, customerId: \"8217524d-4fb4-11f1-a701-0e79396342ad\", cartTimestamp: \"1778519086907\", visitorId: \"e616ea95-4828-4b2a-a078-2bf0bb59f33c\", useCabo: true, useSuco: true}\n  ) {\n    __typename\n    showTotalSavings\n    totalSavings\n    totalSavingsPercent\n    totalPaidMemberSavings\n    totalNonPaidMemberSavings\n    preferredBadging\n    puckDisplayMessage\n    puckMessageURL\n    dealExpirationTimeStamp\n    restrictedPriceDisplayMessage\n    displayableCustomerPrice\n    displayableRegularPrice\n    icrCode\n    isEcoRebateEligible\n    heroRenderPriceOptions\n    openBoxPrice\n    openBoxSavings\n    openBoxCondition\n    lowestOpenboxPrice\n    showLeasingOption\n    connectionType\n    skuId\n    regularPriceMessageType\n    subscriptionSummary {\n      __typename\n      initialPrice\n      initialTermType\n      renewalPrice\n      renewalTermType\n    }\n    paymentOptions {\n      __typename\n      numberOfInstallments\n      installmentAmount\n      installmentServiceFee\n      vendor\n      isDisplayable\n      type\n    }\n    isBbyCardMember\n    financeOption {\n      __typename\n      financeTerm\n      monthlyPayment\n      offerId\n      planType\n      rate\n      totalCost\n      totalCostIncludingTax\n    }\n    mobileContracts {\n      __typename\n      billCreditAmount\n      carrierCode\n      currentPrice\n      customerPrice\n      isDefaultContract\n      regularPrice\n      regularPriceMessageType\n      purchaseType\n      matchesCurrentPrice\n      numberOfPayments\n      hasPriceRange\n      downPaymentAmount\n      totalSavingsPerTerm\n      instantSavings\n      contractTotalSavings\n      id\n      type\n      taxBasis\n      showTotalSavings\n      totalSavingsPercent\n    }\n    giftSkus {\n      __typename\n      brand\n      isGiftCard\n      isRequiredWithOffer\n      offerId\n      parentSkus\n      quantity\n      savings\n      skuId\n    }\n    priceWithCart {\n      adjustedCartItems {\n        __typename\n        skuId\n        savingsAdjustment\n        previousCustomerPrice\n        newCustomerPrice\n      }\n      giftSkus {\n        __typename\n        brand\n        isGiftCard\n        isRequiredWithOffer\n        offerId\n        parentSkus\n        quantity\n        savings\n        skuId\n      }\n      totalOfferSavings\n      totalGiftSavings\n      __typename\n    }\n    customerSelectedDiscountsAvailable {\n      offerId\n      offerName\n      type\n      couponId\n      savingsAdjustment\n      effectiveStartDate\n      effectiveEndDate\n      effectiveEndTime\n      isDiscountSelected\n      offerPrice\n      businessUnit\n      customerAttribute\n      __typename\n    }\n    spendAndGetCabosAvailable {\n      offerId\n      offerName\n      optInCode\n      isOfferActivated\n      effectiveStartDate\n      effectiveEndDate\n      __typename\n    }\n    tieredOffersTracking {\n      amountConsideredToNextTier\n      amountRemainingToNextTier\n      nextTierId\n      quantityConsideredToNextTier\n      quantityRemainingToNextTier\n      savings\n      savingsType\n      tieredOffersGroupName\n      trackingBy\n      tiers {\n        discountValue\n        minPurchaseAmount\n        minQuantity\n        offerId\n        qualified\n        tierId\n        __typename\n      }\n      __typename\n    }\n    whatIfPrice {\n      __typename\n      planPaidMember2 {\n        __typename\n        price\n        savings\n        savingsPercent\n        warranty {\n          __typename\n          skuId\n          fullTermSavings\n          termLength\n        }\n      }\n      planPaidMember3 {\n        __typename\n        price\n        savings\n        savingsPercent\n        warranty {\n          __typename\n          skuId\n          fullTermSavings\n          termLength\n        }\n      }\n    }\n  }\n  offers(\n    input: {salesChannel: \"LargeView\", maxOffers: 10, checkmarkMessagingRequired: true, filterFinanceMinPurchaseAmount: false}\n  ) {\n    __typename\n    offers {\n      __typename\n      hotOffer\n      offerId\n      offerType\n      complexMemberOffer\n    }\n  }\n  __typename\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6576719"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "skuId": "6576719",
      "buyingOptions": [
        {
          "__typename": "InboundBuyingOption",
          "pdpUrl": "https://www.bestbuy.com/product/dell-inspiron-14-14-2k-2-in-1-touchscreen-laptop-amd-ryzen-5-8640hs-2023-8gb-memory-512-gb-storage-midnight-blue/J3K4L6JSFL/sku/6576719",
          "type": "New"
        }
      ],
      "termLength": null,
      "name": {
        "short": "Dell - Inspiron 14 - 14\" 2K 2-in-1 Touchscreen Laptop - AMD Ryzen 5 8640HS 2023 - 8GB Memory - 512 GB Storage - Midnight Blue",
        "__typename": "ProductName"
      },
      "primaryImage": {
        "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6576/6576719_sd.jpg",
        "__typename": "ProductImage"
      },
      "price": {
        "__typename": "ItemPrice",
        "showTotalSavings": true,
        "totalSavings": 182,
        "totalSavingsPercent": 24,
        "totalPaidMemberSavings": 0,
        "totalNonPaidMemberSavings": 182,
        "preferredBadging": "Clearance",
        "puckDisplayMessage": "Clearance",
        "puckMessageURL": null,
        "dealExpirationTimeStamp": null,
        "restrictedPriceDisplayMessage": null,
        "displayableCustomerPrice": 547.99,
        "displayableRegularPrice": 729.99,
        "icrCode": null,
        "isEcoRebateEligible": false,
        "heroRenderPriceOptions": "FINANCE_OPTIONS",
        "openBoxPrice": null,
        "openBoxSavings": null,
        "o
  ...
}
```
</details>

### RatingsAndReviewsRequiredData

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "RatingsAndReviewsRequiredData"`
- **Samples:** 4 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "RatingsAndReviewsRequiredData",
  "variables": {
    "skuId": "6674708",
    "enableRedirectToNewRnR": true
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query RatingsAndReviewsRequiredData($skuId: String!, $enableRedirectToNewRnR: Boolean!) {\n  productBySkuId(skuId: $skuId) {\n    skuId\n    name {\n      short\n      __typename\n    }\n    reviewInfo {\n      reviewCount\n      __typename\n    }\n    url @include(if: $enableRedirectToNewRnR) {\n      reviewStandaloneUrl\n      __typename\n    }\n    __typename\n    openBoxCondition\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6674708"` | string |
| `enableRedirectToNewRnR` | `true` | boolean |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "skuId": "6674708",
      "name": {
        "short": "Lenovo - IdeaPad Slim 3 15.3\" 2k Touchscreen Laptop - AMD Ryzen 7 170 2025 - 16GB Memory - 512GB SSD - Luna Grey",
        "__typename": "ProductName"
      },
      "reviewInfo": {
        "reviewCount": 0,
        "__typename": "ProductReviewInfo"
      },
      "url": {
        "reviewStandaloneUrl": "/product/lenovo-ideapad-slim-3-15-3-2k-touchscreen-laptop-amd-ryzen-7-170-2025-16gb-memory-512gb-ssd-luna-grey/JJGH3KQYP8/sku/6674708/reviews",
        "__typename": "ProductUrl"
      },
      "__typename": "Product",
      "openBoxCondition": null
    }
  }
}
```
</details>

### __unknown__

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "__unknown__"`
- **Samples:** 3 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "query getProductBySkuIdQuery { productBySkuId(skuId: \"6674708\") { skuId hierarchy { bbypres { primary categoryDetail { id name broaderTerms { primaryLineage { id name } } } } } seller { classification } } }"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "skuId": "6674708",
      "hierarchy": {
        "bbypres": [
          {
            "primary": true,
            "categoryDetail": {
              "id": "pcmcat138500050001",
              "name": "All Laptops",
              "broaderTerms": {
                "primaryLineage": [
                  {
                    "id": "abcat0502000",
                    "name": "Laptops"
                  },
                  {
                    "id": "abcat0500000",
                    "name": "Computers & Tablets"
                  },
                  {
                    "id": "cat00000",
                    "name": "Best Buy"
                  }
                ]
              }
            }
          }
        ]
      },
      "seller": {
        "classification": "1P"
      }
    }
  }
}
```
</details>

### RecommendationsComponentExperienceQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "RecommendationsComponentExperienceQuery"`
- **Samples:** 2 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "RecommendationsComponentExperienceQuery",
  "variables": {
    "componentName": "solution-banner",
    "driverSkuId": "6674708",
    "deviceClass": "LV",
    "nodeId": "recs-components-typeinfo-mapping"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query RecommendationsComponentExperienceQuery($componentName: String!, $driverSkuId: String!, $pagePlacement: String, $deviceClass: String!, $nodeId: String!) {\n  recommendationsComponentExperience(\n    input: {componentName: $componentName, driverSkuId: $driverSkuId, pagePlacement: $pagePlacement, deviceClass: $deviceClass, nodeId: $nodeId}\n  ) {\n    isDisplayable\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `componentName` | `"solution-banner"` | string |
| `driverSkuId` | `"6674708"` | string |
| `deviceClass` | `"LV"` | string |
| `nodeId` | `"recs-components-typeinfo-mapping"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "recommendationsComponentExperience": {
      "isDisplayable": false,
      "__typename": "RecommendationsComponentExperienceConnection"
    }
  }
}
```
</details>

### getMediationLayerForNonPLP

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getMediationLayerForNonPLP"`
- **Samples:** 2 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "getMediationLayerForNonPLP",
  "variables": {
    "partyId": "<redacted>",
    "pageSkus": [
      "6674708"
    ],
    "placements": {
      "minSkus": 1,
      "maxSkus": 8,
      "name": "PDP_SPONSORED_CAROUSEL_DEFAULT",
      "pageType": "PDP"
    },
    "platform": "L",
    "referer": "www.bestbuy.com",
    "storeId": "1436",
    "userAgent": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
    "visitorId": "e616ea95-4828-4b2a-a078-2bf0bb59f33c",
    "xForwardedFor": "",
    "zipcode": "97230",
    "salesChannel": "www"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query getMediationLayerForNonPLP($pageSkus: [String], $partyId: String, $placements: [BestMediaAdsPlacementInput], $platform: String!, $referer: String!, $storeId: String, $userAgent: String!, $visitorId: String!, $xForwardedFor: String!, $zipcode: String, $salesChannel: String!, $membershipTier: String, $cartTimestamp: String, $customerId: String) {\n  bestMediaV3(\n    input: {pageSkus: $pageSkus, partyId: $partyId, placements: $placements, platform: $platform, referer: $referer, storeId: $storeId, userAgent: $userAgent, visitorId: $visitorId, xForwardedFor: $xForwardedFor, zipcode: $zipcode}\n  ) {\n    placements {\n      name\n      accepted {\n        campaignId\n        onBasketChangeBeaconForSku\n        onClickBeaconForSku\n        onLoadBeaconForSku\n        onViewBeaconForSku\n        onWishlistBeaconForSku\n        primaryCategoryId\n        rank\n        sku\n        source\n        product {\n          bsin\n          url {\n            pdp\n            relativePdp\n            skuSpecificUrl\n            __typename\n          }\n          skuId\n          whatItIs\n          name {\n            short\n            display\n            rawShort\n            abridged\n            title\n            __typename\n          }\n          brand\n          reviewInfo {\n            averageRating\n            reviewCount\n            syndicatedReviewSummary {\n              clientDisplayName\n              displayLink\n              iconUrl\n              overallRating\n              totalReviewCount\n              __typename\n            }\n            __typename\n          }\n          classification {\n            class {\n              id\n              name\n              __typename\n            }\n            department {\n              id\n              name\n              __typename\n            }\n            subclass {\n              id\n              name\n              __typename\n            }\n            __typename\n          }\n          images {\n            piscesHref\n            href\n            mediaType\n            __typename\n          }\n          primaryImage {\n            piscesHref\n            __typename\n          }\n          price(\n            input: {salesChannel: $salesChannel, planPaidMemberType: $membershipTier, usePriceWithCart: true, cartTimestamp: $cartTimestamp, customerId: $customerId, visitorId: $visitorId}\n          ) {\n            customerPrice\n            icrCode\n            isMAP\n            regularPrice\n            preferredBadging\n            saleEventMessageType\n            strictMapIcr\n            totalSavings\n            __typename\n          }\n          __typename\n          openBoxCondition\n        }\n        __typename\n      }\n      onClickBeaconsForPlacement {\n        source\n        beacon\n        __typename\n      }\n      onLoadBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      onViewBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      rejected {\n        reason\n        sku\n        source\n        __typename\n      }\n      __typename\n    }\n    onLoadBeaconsForPage {\n      beacon\n      source\n      __typename\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `partyId` | `"<redacted>"` | string |
| `pageSkus` | `["6674708"]` | array |
| `placements` | `{"minSkus":1,"maxSkus":8,"name":"PDP_SPONSORED_CAROUSEL_D...` | object |
| `platform` | `"L"` | string |
| `referer` | `"www.bestbuy.com"` | string |
| `storeId` | `"1436"` | string |
| `userAgent` | `"Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebK...` | string |
| `visitorId` | `"e616ea95-4828-4b2a-a078-2bf0bb59f33c"` | string |
| `xForwardedFor` | `""` | string |
| `zipcode` | `"97230"` | string |
| `salesChannel` | `"www"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "bestMediaV3": {
      "placements": [
        {
          "name": "PDP_SPONSORED_CAROUSEL_DEFAULT",
          "accepted": [
            {
              "campaignId": "<redacted>",
              "onBasketChangeBeaconForSku": "https://www.bestbuy.com/awacs-ingestor/api/lighthouse/2054969509106721395?x-client-id=pdp-web",
              "onClickBeaconForSku": "https://www.bestbuy.com/awacs-ingestor/api/lighthouse/2054969509106858828?x-client-id=pdp-web",
              "onLoadBeaconForSku": "",
              "onViewBeaconForSku": "https://www.bestbuy.com/awacs-ingestor/api/lighthouse/2054969509106522570?x-client-id=pdp-web",
              "onWishlistBeaconForSku": "https://www.bestbuy.com/awacs-ingestor/api/lighthouse/2054969509107753787?x-client-id=pdp-web",
              "primaryCategoryId": "pcmcat138500050001",
              "rank": 1,
              "sku": "6571369",
              "source": "A",
              "product": {
                "bsin": "JJGYCX6PWR",
                "url": {
                  "pdp": "https://www.bestbuy.com/product/lenovo-yoga-7i-2-in-1-16-2k-touchscreen-laptop-intel-core-ultra-7-155u-2023-16gb-memory-1tb-ssd-storm-grey/JJGYCX6PWR",
                  "relativePdp": "/product/lenovo-yoga-7i-2-in-1-16-2k-touchscreen-laptop-intel-core-ultra-7-155u-2023-16gb-memory-1tb-ssd-storm-grey/JJGYCX6PWR",
                  "skuSpecificUrl": "https://www.bestbuy.com/product/lenovo-yoga-7i-2-in-1-16-2k-touchscreen-laptop-intel-core-ultra-7-155u-20
  ...
}
```
</details>

### getBbyApolloClientInternalConfig

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getBbyApolloClientInternalConfig"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "\n\tquery getBbyApolloClientInternalConfig($id: String) {\n\t\tmanagedContentByTypeAndId( managedContentInput: {id: $id, type: \"key-value\"} ) {\n\t\t\tdocument\n\t\t\tcatalog\n\t\t\tid\n\t\t}\n\t}\n",
  "variables": {
    "id": "bby-apollo-client"
  },
  "operationName": "getBbyApolloClientInternalConfig"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `id` | `"bby-apollo-client"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "managedContentByTypeAndId": {
      "document": {
        "clientSideFulfillmentLinkConfig": [
          {
            "fieldName": "fulfillmentOptions",
            "relativeUrl": "/gateway/graphql/fulfillment"
          }
        ],
        "disableFulfillmentLink": false
      },
      "catalog": "platform-manager",
      "id": "bby-apollo-client"
    }
  }
}
```
</details>

### CustomerData

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "CustomerData"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "CustomerData",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query CustomerData {\n  customer {\n    ...Customer_Fragment\n    __typename\n  }\n}\n\nfragment Customer_Fragment on Customer {\n  identity {\n    memberId\n    __typename\n  }\n  preferences {\n    identifiers {\n      userToken\n      __typename\n    }\n    store {\n      displayName\n      locationId\n      openBoxShipFromStoreEligible\n      __typename\n    }\n    __typename\n  }\n  name {\n    firstName\n    __typename\n  }\n  creditCards {\n    type\n    __typename\n  }\n  profileLabels {\n    label\n    value\n    __typename\n  }\n  contact {\n    primaryShippingAddress {\n      zip\n      __typename\n    }\n    __typename\n  }\n  planPaidMembership {\n    effectiveType\n    pendingType\n    activeType\n    __typename\n  }\n  __typename\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Forbidden",
      "locations": [],
      "path": [
        "customer",
        "contact"
      ],
      "extensions": {
        "code": "FORBIDDEN"
      }
    },
    {
      "message": "Error - Forbidden",
      "locations": [],
      "path": [
        "customer",
        "identity"
      ],
      "extensions": {
        "code": "FORBIDDEN"
      }
    }
  ],
  "data": {
    "customer": {
      "identity": null,
      "preferences": {
        "identifiers": {
          "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
          "__typename": "CustomerIdentifier"
        },
        "store": null,
        "__typename": "CustomerPreference"
      },
      "name": {
        "firstName": "ARI",
        "__typename": "CustomerName"
      },
      "creditCards": null,
      "profileLabels": [
        {
          "label": "LOYALTY_TIER_CORE",
          "value": true,
          "__typename": "CustomerProfileLabel"
        }
      ],
      "contact": null,
      "planPaidMembership": {
        "effectiveType": "NULL",
        "pendingType": "NULL",
        "activeType": "NULL",
        "__typename": "PlanPaidMembership"
      },
      "__typename": "Customer"
    }
  }
}
```
</details>

### CartQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "CartQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "CartQuery",
  "query": "query CartQuery {\n  customer {\n    cart {\n      totalQuantity\n    }\n  }\n}",
  "variables": {}
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "customer": {
      "cart": {
        "totalQuantity": 0
      }
    }
  }
}
```
</details>

### PageLoadAnalyticsData_Init_Pdp

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "PageLoadAnalyticsData_Init_Pdp"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "PageLoadAnalyticsData_Init_Pdp",
  "variables": {
    "isBestbuyMember": true,
    "skuId": "6674708",
    "input": {
      "salesChannel": "LargeView"
    },
    "isBadgeEnabled": false,
    "isBadgeV2Enabled": true,
    "bsinBuyingOptionsInput": {
      "skuId": "6674708",
      "bsin": "JJGH3KQYP8",
      "salesChannel": "LargeView",
      "postalCode": "",
      "locationId": "1436"
    }
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query PageLoadAnalyticsData_Init_Pdp($skuId: String!, $input: ProductItemPriceInput!, $isBestbuyMember: Boolean!, $isBadgeEnabled: Boolean!, $isBadgeV2Enabled: Boolean!, $bsinBuyingOptionsInput: BsinBuyingOptionsInput!) {\n  productBySkuId(skuId: $skuId) {\n    skuId\n    ...AnalyticsFulfillmentOptionsFragment\n    buyingOptions {\n      skuId\n      type\n      product {\n        ...AnalyticsFulfillmentOptionsFragment\n        __typename\n        skuId\n        openBoxCondition\n      }\n      __typename\n    }\n    seller {\n      id\n      __typename\n    }\n    whatItIs\n    hierarchy {\n      bbypres {\n        id\n        primary\n        categoryDetail {\n          name\n          seoUrl\n          broaderTerms {\n            primaryLineage {\n              id\n              name\n              seoUrl\n              sequence\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    arModels {\n      uri\n      format\n      __typename\n    }\n    reviewInfo {\n      averageRating\n      reviewCount\n      __typename\n    }\n    price(input: $input) {\n      customerPrice\n      currentPrice\n      priceEventType\n      puckDisplayMessage\n      heroRenderPriceOptions\n      paymentOptions {\n        numberOfInstallments\n        installmentAmount\n        vendor\n        isDisplayable\n        type\n        __typename\n      }\n      financeOption {\n        monthlyPayment\n        offerId\n        __typename\n      }\n      tieredOffersTracking {\n        amountConsideredToNextTier\n        amountRemainingToNextTier\n        nextTierId\n        quantityConsideredToNextTier\n        quantityRemainingToNextTier\n        savings\n        savingsType\n        tieredOffersGroupName\n        trackingBy\n        tiers {\n          discountValue\n          minPurchaseAmount\n          minQuantity\n          offerId\n          qualified\n          tierId\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    productVariationDetailDisplay {\n      type\n      title\n      variationTypes {\n        definition\n        displayName\n        rawName\n        __typename\n      }\n      productVariations {\n        shortName\n        color\n        colorCategory\n        sku\n        variations {\n          rawName\n          value\n          __typename\n        }\n        product {\n          name {\n            short\n            __typename\n          }\n          seller {\n            classification\n            id\n            __typename\n          }\n          __typename\n          skuId\n          openBoxCondition\n        }\n        __typename\n      }\n      __typename\n    }\n    ...AnalyticsBadgesFragment @include(if: $isBadgeEnabled)\n    ...AnalyticsBadgesV2Fragment @include(if: $isBadgeV2Enabled)\n    operationalAttributes {\n      values\n      __typename\n    }\n    ...featuredSkuRankingId\n    __typename\n    openBoxCondition\n  }\n  bsinBuyingOptions(input: $bsinBuyingOptionsInput) {\n    lowestAvailableBSINPrice\n    highestAvailableBSINPrice\n    __typename\n    bsin\n  }\n}\n\nfragment AnalyticsFulfillmentOptionsFragment on Product {\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment featuredSkuRankingId on Product {\n  featuredSkuRank(filter: {isBestbuyMember: $isBestbuyMember}) {\n    rankingId\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment AnalyticsBadgesFragment on Product {\n  badges {\n    detailsHref\n    displayName\n    endDate\n    imageHref\n    sortOrder\n    startDate\n    typeCode\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment AnalyticsBadgesV2Fragment on Product {\n  badgesV2 {\n    badgeId\n    label\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `isBestbuyMember` | `true` | boolean |
| `skuId` | `"6674708"` | string |
| `input` | `{"salesChannel":"LargeView"}` | object |
| `isBadgeEnabled` | `false` | boolean |
| `isBadgeV2Enabled` | `true` | boolean |
| `bsinBuyingOptionsInput` | `{"skuId":"6674708","bsin":"JJGH3KQYP8","salesChannel":"La...` | object |

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "productBySkuId",
        "arModels"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": {
    "productBySkuId": {
      "skuId": "6674708",
      "__typename": "Product",
      "openBoxCondition": null,
      "buyingOptions": [
        {
          "skuId": "6674708",
          "type": "New",
          "product": {
            "__typename": "Product",
            "skuId": "6674708",
            "openBoxCondition": null
          },
          "__typename": "InboundBuyingOption"
        }
      ],
      "seller": {
        "id": "bby",
        "__typename": "Seller"
      },
      "whatItIs": [
        "Laptop Computer"
      ],
      "hierarchy": {
        "bbypres": [
          {
            "id": "pcmcat138500050001",
            "primary": true,
            "categoryDetail": {
              "name": "All Laptops",
              "seoUrl": "https://www.bestbuy.com/site/laptop-computers/all-laptops/pcmcat138500050001.c?id=pcmcat138500050001",
              "broaderTerms": {
                "primaryLineage": [
                  {
                    "id": "abcat0502000",
                    "name": "Laptops",
                    "seoUrl": "https://www.bestbuy.com/site/computers-pcs/laptop-computers/abcat0502000.c?id=abcat0502000",
                    "sequence": 0,
                    "__typename": "HierarchyLineage"
                  },

  ...
}
```
</details>

### GetSpotlightAd

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "GetSpotlightAd"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "GetSpotlightAd",
  "variables": {
    "pageSkus": "6674708",
    "partyId": "<redacted>",
    "placements": {
      "name": "PDP_SPONSORED_SPOTLIGHT",
      "minSkus": 1,
      "maxSkus": 1,
      "pageType": ""
    },
    "platform": "L",
    "salesChannel": "LARGE_VIEW",
    "storeId": "1436",
    "userAgent": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
    "visitorId": "e616ea95-4828-4b2a-a078-2bf0bb59f33c",
    "zipcode": "21117"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query GetSpotlightAd($pageSkus: [String], $partyId: String, $placements: [BestMediaAdsPlacementInput], $platform: String!, $storeId: String, $userAgent: String!, $visitorId: String!, $xForwardedFor: String, $zipcode: String, $salesChannel: String!, $membershipTier: String, $cartTimestamp: String, $customerId: String) {\n  bestMediaV3(\n    input: {pageSkus: $pageSkus, partyId: $partyId, placements: $placements, platform: $platform, storeId: $storeId, visitorId: $visitorId, userAgent: $userAgent, xForwardedFor: $xForwardedFor, zipcode: $zipcode}\n  ) {\n    onLoadBeaconsForPage {\n      source\n      beacon\n      __typename\n    }\n    placements {\n      id\n      name\n      accepted {\n        source\n        sku\n        onLoadBeaconForSku\n        onClickBeaconForSku\n        onViewBeaconForSku\n        onWishlistBeaconForSku\n        onBasketChangeBeaconForSku\n        primaryCategoryId\n        rank\n        campaignId\n        product {\n          bsin\n          name {\n            short\n            __typename\n          }\n          skuId\n          primaryImage {\n            piscesHref\n            __typename\n          }\n          url {\n            pdp\n            skuSpecificUrl\n            __typename\n          }\n          reviewInfo {\n            averageRating\n            reviewCount\n            syndicatedReviewSummary {\n              clientDisplayName\n              overallRating\n              totalReviewCount\n              __typename\n            }\n            __typename\n          }\n          price(\n            input: {salesChannel: $salesChannel, planPaidMemberType: $membershipTier, usePriceWithCart: true, cartTimestamp: $cartTimestamp, customerId: $customerId, visitorId: $visitorId}\n          ) {\n            customerPrice\n            icrCode\n            isMAP\n            regularPrice\n            preferredBadging\n            saleEventMessageType\n            strictMapIcr\n            totalSavings\n            __typename\n          }\n          __typename\n          openBoxCondition\n        }\n        __typename\n      }\n      rejected {\n        reason\n        sku\n        source\n        __typename\n      }\n      onLoadBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      onViewBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `pageSkus` | `"6674708"` | string |
| `partyId` | `"<redacted>"` | string |
| `placements` | `{"name":"PDP_SPONSORED_SPOTLIGHT","minSkus":1,"maxSkus":1...` | object |
| `platform` | `"L"` | string |
| `salesChannel` | `"LARGE_VIEW"` | string |
| `storeId` | `"1436"` | string |
| `userAgent` | `"Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebK...` | string |
| `visitorId` | `"e616ea95-4828-4b2a-a078-2bf0bb59f33c"` | string |
| `zipcode` | `"21117"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "bestMediaV3": {
      "onLoadBeaconsForPage": [],
      "placements": [
        {
          "id": "<redacted>",
          "name": "PDP_SPONSORED_SPOTLIGHT",
          "accepted": [
            {
              "source": "A",
              "sku": "6576719",
              "onLoadBeaconForSku": "",
              "onClickBeaconForSku": "https://b.us5.us.criteo.com/rm?rm_e=CsgQG3KxpZXX7v90pOIDDbnULE5fRLN69MZTy3I1uTnUEmuYaMQiIzBlulBUnsiLFIyG6Lp9S1YquhIU8vvC7sgTjDm_htMwE9Kqu7DH8GbSxxwkTSGSSnm5UzuldnRR0shTAcYqaP2ZEgrNqeEIZnKEjsk-PfecrvsMZhtvswJ_lzJXEf8Zcs8xRp8dH-r4LxMtuyAm5kytdcXmSCG9wO-cF4hhuAMiBDbvdC0WaMajz2PsCI9vw8XbsXQBwRMR8A9f-cOBgOd7v1ycHK3q3hbC4WVCnME7Bp9BuwIzI_eRB2WvrG0JC71_rSJX3CoSmwtuuYU4sAIn6E_WITD1L4WgsVVLqS8Y_MnzomAMWQhHqSP6adJD6f8c6IIoJOeaULlHZB_x5vLTAna5BF0cnuKwGmhyv_DNg7N2XRBk5PxlqI66mDQ6kUua9cPy9PwK_OEM_bsdw2J48j7XvhE4Ig&ev=4",
              "onViewBeaconForSku": "https://b.us5.us.criteo.com/rm?rm_e=9g1UIQUSpiLYdeMAf6A-NmWTRVJXmR02XRarf-ukdD315OwqMTENjca1zQ_2M49DkEl0UX3lg_xp48eCLErSTAM5J5TLFpQc-EAvmo6BBpS-Dl-8TtAMwhAb-VR4DZ617Al_VeS8jmWFWDpElUsbGDa74bM0aXC0nwHPuAxPHCaD-JwWgnWSoVtbmT2jyB7uB42vyzlIU1YuBdOxnlrn2EJ_2MopJTuG3eNOjTbtO_SVfGr2OIXN4SXiHom1MqZ5gXtZ3ZNxpf2cLR4CJ-m8qc91Qb0GP_MKubFZSL_Ci49tsAO58iMG0dYg9HYJ3FEvii3E1vwQ2N47z62aXy59WaB3bjhgN5EfR3I4JnMxowv3zItNU3DZom8ZXepTA4KME3Vwf1BWiQ2oXvPU9DccwSBlCz277QGSemCZYmtnOuB8_KLkteIzAh17PJdmUvsmcYgUwPFxhQbyECrmRhihMQ&ev=4",
              "onWishlistBeaconForSku": "https://b.us5.us.criteo.com/rm?rm_e=JxB_-
  ...
}
```
</details>

### MyQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "MyQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "query MyQuery {\n  customer {\n    prioritizedCallToAction(\n      input: {origin: \"toast\", redirectUrl: \"https://www.bestbuy.com/product/lenovo-ideapad-slim-3-15-3-2k-touchscreen-laptop-amd-ryzen-7-170-2025-16gb-memory-512gb-ssd-luna-grey/JJGH3KQYP8/sku/6674708\"}\n    ) {\n      copy\n      experienceUrl\n      experienceUrlCopy\n      notification\n      notificationType\n    }\n  }\n}",
  "variables": {},
  "operationName": "MyQuery"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "customer": {
      "prioritizedCallToAction": {
        "copy": "<strong>Add recovery phone number.</strong><br>In case you ever need to recover your account, we'll send you a text. Please {experienceUrl}.",
        "experienceUrl": "https://www.bestbuy.com/identity/recovery/phone/entrypoint?origin=toast&ctaName=add-account-recovery-phone&redirectUrl=https%3A%2F%2Fwww.bestbuy.com%2Fproduct%2Flenovo-ideapad-slim-3-15-3-2k-touchscreen-laptop-amd-ryzen-7-170-2025-16gb-memory-512gb-ssd-luna-grey%2FJJGH3KQYP8%2Fsku%2F6674708",
        "experienceUrlCopy": "add your phone number",
        "notification": "add-account-recovery-phone",
        "notificationType": "moderate"
      }
    }
  }
}
```
</details>

### managedContentByTypeAndId

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "managedContentByTypeAndId"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "managedContentByTypeAndId",
  "variables": {
    "catalog": "platform-manager",
    "type": "key-value",
    "id": "ask-blue-configs"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query managedContentByTypeAndId($catalog: String!, $type: String!, $id: String!) {\n  managedContentByTypeAndId(\n    managedContentInput: {catalog: $catalog, type: $type, id: $id}\n  ) {\n    document\n    __typename\n    catalog\n    id\n    type\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `catalog` | `"platform-manager"` | string |
| `type` | `"key-value"` | string |
| `id` | `"ask-blue-configs"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "managedContentByTypeAndId": {
      "document": {
        "API_END_POINT_URL": {
          "app": "https://app.bestbuy.com",
          "web": "https://www.bestbuy.com"
        },
        "ENVIRONMENT": "development",
        "MOCK_API_END_POINT_URL": "https://endpoints.stratus.bby/digital/eks/te-non-a/us-east-1/askblemcksrvr-eks/askblemcksrvr-int",
        "MOCK_END_POINT_API_KEY": "3cb6c103878165d47ccc36696e7ec32fc0ba3e48265b0ba2aaab004b636fd7e8",
        "askBlueEnabledApp": true,
        "askBlueEnabledWeb": true,
        "askBlueUtList": [
          "49a4bbb9-aece-11ea-97cd-005056aeb6f7",
          "572a7234-8d8d-11f0-b83d-06e81abc3177",
          "a10a2ebf-4ea7-11f1-8af7-0254a68b6c75",
          "be6e0487-0f8a-11f0-b6b7-0affc03f8695",
          "d94cf4f1-d4bd-11ed-9e49-005056a8d8b1",
          "e64f2717-6253-11f0-9621-121591935d1f",
          "1fc31272-b653-11ea-8136-0a1533e9dd2f",
          "d99456c0-03d5-11f0-bcf4-068fdac8c883",
          "52bfaaf4-690f-11ea-ac49-0a0eccadca29",
          "e64f2717-6253-11f0-9621-121591935d1f",
          "68cd49a0-2696-11f1-b193-029e43b7edf1",
          "a9bc4ea8-0a47-11ee-9023-0a7fc935345b",
          "01a93c7b-dffe-11ef-baf1-02915e3ea5fd",
          "a3e541d5-eba8-11e2-ac2c-00505692405c",
          "1018a36e-3cd7-11ef-b94c-025cc9ad82b7",
          "7bd79a6e-2e73-11f1-b3cf-0affe2e5d05d",
          "035c8623-4f3c-11ec-935b-0abe48b89689",
          "496c89a6-3c9c-11f0-ae91-0281e62b3cdb",
          "bb94d7c6-a18b-11e8-8
  ...
}
```
</details>

### WarrantySelector_CustomerPriceAndButtonState

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "WarrantySelector_CustomerPriceAndButtonState"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "WarrantySelector_CustomerPriceAndButtonState",
  "variables": {
    "skuId": "6674708",
    "membershipTier": "NULL",
    "openBoxCondition": null,
    "salesChannel": "LargeView",
    "key": "recommendations-experience-configs"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query WarrantySelector_CustomerPriceAndButtonState($skuId: String!, $salesChannel: String!, $membershipTier: String, $openBoxCondition: Int, $key: String!) {\n  ...ManagedContentByTypeAndId\n  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {\n    price(input: {salesChannel: $salesChannel, planPaidMemberType: $membershipTier}) {\n      customerPrice\n      __typename\n    }\n    openBoxOptions {\n      product {\n        openBoxCondition\n        price(input: {salesChannel: $salesChannel, planPaidMemberType: $membershipTier}) {\n          customerPrice\n          openBoxPrice\n          __typename\n        }\n        __typename\n        skuId\n      }\n      __typename\n    }\n    __typename\n    skuId\n    openBoxCondition\n  }\n}\n\nfragment ManagedContentByTypeAndId on Query {\n  managedContentByTypeAndId(managedContentInput: {type: \"key-value\", id: $key}) {\n    ...ManagedContentDocument\n    __typename\n    catalog\n    id\n    type\n  }\n  __typename\n}\n\nfragment ManagedContentDocument on ManagedContent {\n  document\n  id\n  type\n  catalog\n  __typename\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6674708"` | string |
| `membershipTier` | `"NULL"` | string |
| `openBoxCondition` | `null` | object |
| `salesChannel` | `"LargeView"` | string |
| `key` | `"recommendations-experience-configs"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "managedContentByTypeAndId": {
      "document": {
        "abTest353ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scalePackageDealsCarouselNewLayout": true,
          "scaleUREHorizontalLayout": true,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "abTest354ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "abTest365ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "accessories-in-variations": {
          "isUREEnabled": true
        },
        "badgeConfig": {
          "bestSelling": {},
          "default": {},
          "gandalf": {},
          "overallPick": {
            "badgeBackgroundStyle": "bg-default-emphasis",
            "badgeIcon": "Tag",
            "badgeIconStyle": "fill-secondary-on-emphasis w-150 h-150",
            "badgeImageStyle": {
              "app": {
                "height": 12,
                "width": 12
              },
              "web": {
                "lg": "w-200 h-200",
                "md": "w-150 h-150",
                "sm": "w-150 h-150"
              }
            },
            "badgeImageUrl": "https://pisces.bbystatic.com/i
  ...
}
```
</details>

### AccessoriesInVariations_ConfigData

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "AccessoriesInVariations_ConfigData"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "AccessoriesInVariations_ConfigData",
  "variables": {
    "deviceClass": "LV",
    "aiv": "accessories-in-variations",
    "nodeId": "recs-components-typeinfo-mapping",
    "key": "recommendations-experience-configs",
    "driverSkuId": "6674708"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query AccessoriesInVariations_ConfigData($aiv: String!, $driverSkuId: String!, $deviceClass: String!, $nodeId: String!, $key: String!) {\n  aivMatchTypeInfo: recommendationsComponentExperience(\n    input: {componentName: $aiv, driverSkuId: $driverSkuId, deviceClass: $deviceClass, nodeId: $nodeId}\n  ) {\n    isDisplayable\n    __typename\n  }\n  ...ManagedContentByTypeAndId\n}\n\nfragment ManagedContentByTypeAndId on Query {\n  managedContentByTypeAndId(managedContentInput: {type: \"key-value\", id: $key}) {\n    ...ManagedContentDocument\n    __typename\n    catalog\n    id\n    type\n  }\n  __typename\n}\n\nfragment ManagedContentDocument on ManagedContent {\n  document\n  id\n  type\n  catalog\n  __typename\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `deviceClass` | `"LV"` | string |
| `aiv` | `"accessories-in-variations"` | string |
| `nodeId` | `"recs-components-typeinfo-mapping"` | string |
| `key` | `"recommendations-experience-configs"` | string |
| `driverSkuId` | `"6674708"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "aivMatchTypeInfo": {
      "isDisplayable": true,
      "__typename": "RecommendationsComponentExperienceConnection"
    },
    "managedContentByTypeAndId": {
      "document": {
        "abTest353ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scalePackageDealsCarouselNewLayout": true,
          "scaleUREHorizontalLayout": true,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "abTest354ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "abTest365ScalingStrategy": {
          "scaleAIVPostcardSpacing": false,
          "scaleWarrantySelectorInterruptor": true,
          "scaleWarrantySelectorPostcardSpacing": false
        },
        "accessories-in-variations": {
          "isUREEnabled": true
        },
        "badgeConfig": {
          "bestSelling": {},
          "default": {},
          "gandalf": {},
          "overallPick": {
            "badgeBackgroundStyle": "bg-default-emphasis",
            "badgeIcon": "Tag",
            "badgeIconStyle": "fill-secondary-on-emphasis w-150 h-150",
            "badgeImageStyle": {
              "app": {
                "height": 12,
                "width": 12
              },
              "web": {
                "lg": "w-200 h-200",
                "md": "w-150 h-150"
  ...
}
```
</details>

### GetCompareProduct

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "GetCompareProduct"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "GetCompareProduct",
  "variables": {
    "placement": "single-compare",
    "site": "dotcom-l",
    "limit": 3,
    "skuId": "6674708"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query GetCompareProduct($placement: String!, $site: String!, $limit: Int!, $skuId: String!) {\n  ...CompareProduct_Fragment\n}\n\nfragment CompareProduct_Fragment on Query {\n  productBySkuId(skuId: $skuId) {\n    description {\n      long\n      __typename\n    }\n    name {\n      short\n      __typename\n    }\n    primaryImage {\n      piscesHref\n      __typename\n    }\n    reviewInfo {\n      averageRating\n      reviewCount\n      conFeatures {\n        name\n        __typename\n      }\n      proFeatures {\n        name\n        __typename\n      }\n      __typename\n    }\n    specificationGroups {\n      name\n      specifications {\n        definition\n        displayName\n        value\n        __typename\n      }\n      __typename\n    }\n    url {\n      relativePdp\n      __typename\n    }\n    skuId\n    __typename\n    openBoxCondition\n  }\n  recommendations(\n    filter: {placement: $placement, site: $site, limit: $limit, skus: [$skuId]}\n  ) {\n    subPlacements {\n      recommendations {\n        ep\n        id\n        item {\n          ... on Product {\n            primaryImage {\n              piscesHref\n              __typename\n            }\n            url {\n              relativePdp\n              __typename\n            }\n            description {\n              long\n              __typename\n            }\n            name {\n              short\n              __typename\n            }\n            reviewInfo {\n              averageRating\n              reviewCount\n              conFeatures {\n                name\n                __typename\n              }\n              proFeatures {\n                name\n                __typename\n              }\n              __typename\n            }\n            specificationGroups {\n              name\n              specifications {\n                definition\n                displayName\n                value\n                __typename\n              }\n              __typename\n            }\n            skuId\n            __typename\n            openBoxCondition\n          }\n          __typename\n        }\n        __typename\n      }\n      ep\n      id\n      name\n      __typename\n    }\n    __typename\n  }\n  __typename\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `placement` | `"single-compare"` | string |
| `site` | `"dotcom-l"` | string |
| `limit` | `3` | number |
| `skuId` | `"6674708"` | string |

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "productBySkuId",
        "reviewInfo",
        "conFeatures"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "productBySkuId",
        "reviewInfo",
        "proFeatures"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": {
    "productBySkuId": {
      "description": {
        "long": "Stay mobile with the IdeaPad Slim 3. Featuring AMD Ryzen™ 100 Series Processors with revolutionary Zen 3+ architecture and AI, it offers top performance. The 15.3\" WQXGA 16:10 display with TUV certification ensuring less eye strain with prolonged use, and the 60Wh battery provides it with rapid charge technology to just keep going.",
        "__typename": "ProductDescription"
      },
      "name": {
        "short": "Lenovo - IdeaPad Slim 3 15.3\" 2k Touchscreen Laptop - AMD Ryzen 7 170 2025 - 16GB Memory - 512GB SSD - Luna Grey",
        "__typename": "ProductName"
      },
      "primaryImage": {
        "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/4c514590-f34b-4511-a879-34f8b97a4828.jpg",
        "__typename": "ProductImage"
      },
      "reviewInfo": {
        "averageRating": 0,
        "reviewCount": 0,
        "conFeatures": null,
        "proFeatures": null,
        "__typename": "ProductRev
  ...
}
```
</details>

### BBYServiceWorkerConfig

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "BBYServiceWorkerConfig"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "\n    query BBYServiceWorkerConfig {\n        versionedJsonByKey(key: \"service-worker-performance\") {\n        json\n    }\n}",
  "operationName": "BBYServiceWorkerConfig"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "versionedJsonByKey": {
      "json": {
        "cacheMaxAges": {
          "cartPrefetchTtl": 90,
          "serviceWorkerConfigTtl": 900
        },
        "cartPrefetchABTestKey": "exp0408",
        "deoExperimentStatus": {
          "enableEXP0408": false
        },
        "enabledModules": [
          "CART"
        ],
        "log": {
          "level": "error"
        }
      }
    }
  }
}
```
</details>

### WarrantySelector_AssociatedWarranties

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "WarrantySelector_AssociatedWarranties"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "WarrantySelector_AssociatedWarranties",
  "variables": {
    "skuId": "6674708",
    "warrantyPrice": 599.99,
    "hasPaidMembership": false,
    "membershipTier": "NULL",
    "openBoxCondition": null
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query WarrantySelector_AssociatedWarranties($skuId: String!, $warrantyPrice: Float, $hasPaidMembership: Boolean, $membershipTier: String, $openBoxCondition: Int) {\n  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {\n    associatedWarranties(\n      filter: {warrantyPrice: $warrantyPrice, hasPaidMembership: $hasPaidMembership, membershipTier: $membershipTier}\n    ) {\n      popularDuration\n      recommendedPercent\n      warranties {\n        ...WarrantyInterruptorFragment\n        openBoxCondition\n        skuId\n        termLength {\n          unitOfMeasure\n          value\n          __typename\n        }\n        reviewInfo {\n          reviewCount\n          averageRating\n          recommendedPercent\n          __typename\n        }\n        term\n        protectionType\n        planType\n        name {\n          short\n          __typename\n        }\n        description {\n          short\n          __typename\n        }\n        productServiceDescription {\n          details\n          title\n          __typename\n        }\n        classification {\n          class {\n            id\n            __typename\n          }\n          __typename\n        }\n        servicePlan {\n          subtype {\n            code\n            description\n            __typename\n          }\n          __typename\n        }\n        operationalAttributes {\n          displayName\n          values\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n    skuId\n    openBoxCondition\n  }\n}\n\nfragment WarrantyInterruptorFragment on Product {\n  price(\n    input: {salesChannel: \"LargeView\", planPaidMemberType: \"NULL\", customerAttributes: \"\"}\n  ) {\n    customerPrice\n    regularPrice\n    preferredBadging\n    puckDisplayMessage\n    __typename\n  }\n  termLength {\n    value\n    unitOfMeasure\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6674708"` | string |
| `warrantyPrice` | `599.99` | number |
| `hasPaidMembership` | `false` | boolean |
| `membershipTier` | `"NULL"` | string |
| `openBoxCondition` | `null` | object |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "associatedWarranties": {
        "popularDuration": null,
        "recommendedPercent": null,
        "warranties": [
          {
            "price": {
              "customerPrice": 149.99,
              "regularPrice": 149.99,
              "preferredBadging": null,
              "puckDisplayMessage": null,
              "__typename": "ItemPrice"
            },
            "termLength": {
              "value": 1,
              "unitOfMeasure": "Years",
              "__typename": "TermLength"
            },
            "__typename": "Product",
            "skuId": "6626901",
            "openBoxCondition": null,
            "reviewInfo": {
              "reviewCount": 11933,
              "averageRating": 4.6,
              "recommendedPercent": 93,
              "__typename": "ProductReviewInfo"
            },
            "term": "12 months",
            "protectionType": "Accidental",
            "planType": "GSP",
            "name": {
              "short": "1-Year Accidental Geek Squad Protection",
              "__typename": "ProductName"
            },
            "description": {
              "short": "Enhance your manufacturer warranty and get extended coverage when the warranty ends, including for:<br><br> <ul> <li>Accidental damage while handling your product </li> <li>One-time replacement for the original battery </li> <li>Hard drive that stops working</li> <li>Hardware failure, including normal wear and tear </li>
  ...
}
```
</details>

### AccessoriesInVariations_FetchData

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "AccessoriesInVariations_FetchData"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "AccessoriesInVariations_FetchData",
  "variables": {
    "driverSkuId": "6674708",
    "site": "dotcom-l",
    "placementAIV": "cyp",
    "isBestbuyMember": false,
    "planPaidMembership": "NULL",
    "customerAttributes": [],
    "isMarketPlace": true,
    "cartTimestamp": "<redacted>",
    "ut": "8217524d-4fb4-11f1-a701-0e79396342ad",
    "vt": "3161e7d0-5497-11f0-bd66-12204ace29a7"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query AccessoriesInVariations_FetchData($driverSkuId: String!, $site: String!, $placementAIV: String!, $isMarketPlace: Boolean!, $isBestbuyMember: Boolean!, $planPaidMembership: String!, $customerAttributes: [String!], $cartTimestamp: String!, $ut: String, $vt: String!) {\n  productBySkuId(skuId: $driverSkuId) {\n    completeYourPurchase {\n      products {\n        skuId\n        product {\n          ...Products @skip(if: $isMarketPlace)\n          ...BsinProduct @include(if: $isMarketPlace)\n          __typename\n          skuId\n          openBoxCondition\n        }\n        __typename\n      }\n      useRecommendedProduct\n      __typename\n    }\n    __typename\n    skuId\n    openBoxCondition\n  }\n  recommendationsV2(\n    input: {placement: $placementAIV, site: $site, skus: [$driverSkuId]}\n  ) {\n    subPlacements {\n      id\n      name\n      recommendations {\n        id\n        item {\n          ... on Product {\n            ...Products\n            __typename\n            skuId\n            openBoxCondition\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment BsinProduct on Product {\n  bsinProduct {\n    bsin\n    featuredSKU(filter: {isBestbuyMember: $isBestbuyMember}) {\n      product {\n        ...Products\n        __typename\n        skuId\n        openBoxCondition\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment Products on Product {\n  skuId\n  name {\n    short\n    __typename\n  }\n  url {\n    skuSpecificUrl\n    relativePdp\n    pdp\n    __typename\n  }\n  primaryImage {\n    piscesHref\n    __typename\n  }\n  price(\n    input: {salesChannel: \"LargeView\", planPaidMemberType: $planPaidMembership, customerAttributes: $customerAttributes, usePriceWithCart: true, cartTimestamp: $cartTimestamp, visitorId: $vt, customerId: $ut}\n  ) {\n    totalSavings\n    customerPrice\n    regularPrice\n    preferredBadging\n    isMAP\n    icrCode\n    strictMapIcr\n    saleEventMessageType\n    __typename\n  }\n  __typename\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `driverSkuId` | `"6674708"` | string |
| `site` | `"dotcom-l"` | string |
| `placementAIV` | `"cyp"` | string |
| `isBestbuyMember` | `false` | boolean |
| `planPaidMembership` | `"NULL"` | string |
| `customerAttributes` | `[]` | array |
| `isMarketPlace` | `true` | boolean |
| `cartTimestamp` | `"<redacted>"` | string |
| `ut` | `"8217524d-4fb4-11f1-a701-0e79396342ad"` | string |
| `vt` | `"3161e7d0-5497-11f0-bd66-12204ace29a7"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "completeYourPurchase": {
        "products": [
          {
            "skuId": "6630534",
            "product": {
              "bsinProduct": {
                "bsin": "J3ZKKFJSLW",
                "featuredSKU": {
                  "product": {
                    "skuId": "6630534",
                    "name": {
                      "short": "Microsoft - 365 Personal (1 Person) (3-Month Subscription) - Activation Required - Windows, Mac OS, Apple iOS, Android [Digital]",
                      "__typename": "ProductName"
                    },
                    "url": {
                      "skuSpecificUrl": "https://www.bestbuy.com/product/microsoft-365-personal-1-person-3-month-subscription-activation-required-windows-mac-os-apple-ios-android-digital/J3ZKKFJSLW/sku/6630534",
                      "relativePdp": "/product/microsoft-365-personal-1-person-3-month-subscription-activation-required-windows-mac-os-apple-ios-android-digital/J3ZKKFJSLW",
                      "pdp": "https://www.bestbuy.com/product/microsoft-365-personal-1-person-3-month-subscription-activation-required-windows-mac-os-apple-ios-android-digital/J3ZKKFJSLW",
                      "__typename": "ProductUrl"
                    },
                    "primaryImage": {
                      "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/1a3ca6db-e1d3-4e1f-a121-21728ec455e7.jpg",
                      "__typename": "Produc
  ...
}
```
</details>

### AddToCart_FulfillmentDynamicQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "AddToCart_FulfillmentDynamicQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "AddToCart_FulfillmentDynamicQuery",
  "variables": {
    "skuId": "6576719",
    "productPriceInput": {
      "customerAttributes": "LOYALTY_TIER_CORE",
      "salesChannel": "LARGE_VIEW",
      "customerId": "8217524d-4fb4-11f1-a701-0e79396342ad",
      "planPaidMemberType": "NULL",
      "ct": "",
      "isStoreAgent": false,
      "locationId": ""
    }
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query AddToCart_FulfillmentDynamicQuery($skuId: String!, $productPriceInput: ProductItemPriceInput!, $openBoxCondition: Int) {\n  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {\n    ...FullfillmentProductBySkuIdFragment\n    __typename\n    skuId\n    openBoxCondition\n  }\n}\n\nfragment FullfillmentProductBySkuIdFragment on Product {\n  brand\n  brandId\n  classification {\n    class {\n      id\n      __typename\n    }\n    __typename\n  }\n  isSmallMediumBusiness\n  releaseDateDisplayValue\n  whatItIs\n  eligibleGatedEventCustomerSegments {\n    canPurchaseNow\n    __typename\n  }\n  isConstrainedHighVelocity\n  inStoreServiceType\n  buyingOptions {\n    type\n    product {\n      openBoxCondition\n      openBoxOptions {\n        code\n        __typename\n      }\n      inStoreServiceType\n      price(input: $productPriceInput) {\n        openBoxCondition\n        __typename\n      }\n      primaryImage {\n        piscesHref\n        __typename\n      }\n      name {\n        short\n        __typename\n      }\n      __typename\n      skuId\n    }\n    pdpUrl\n    __typename\n  }\n  price(input: $productPriceInput) {\n    customerPrice\n    mobileContracts {\n      isDefaultContract\n      purchaseType\n      numberOfPayments\n      __typename\n    }\n    __typename\n  }\n  waitlists {\n    id\n    name\n    type\n    __typename\n  }\n  ...MpFragment\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment MpFragment on Product {\n  bsinProduct {\n    bsin\n    products {\n      openBoxCondition\n      condition {\n        type\n        __typename\n      }\n      seller {\n        classification\n        __typename\n      }\n      skuId\n      __typename\n    }\n    __typename\n  }\n  bsin\n  seller {\n    classification\n    id\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6576719"` | string |
| `productPriceInput` | `{"customerAttributes":"LOYALTY_TIER_CORE","salesChannel":...` | object |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "brand": "Dell",
      "brandId": "2091",
      "classification": {
        "class": {
          "id": "770",
          "__typename": "ProductClass"
        },
        "__typename": "ProductClassification"
      },
      "isSmallMediumBusiness": null,
      "releaseDateDisplayValue": null,
      "whatItIs": [
        "Laptop Computer"
      ],
      "eligibleGatedEventCustomerSegments": null,
      "isConstrainedHighVelocity": false,
      "inStoreServiceType": null,
      "buyingOptions": [
        {
          "type": "New",
          "product": {
            "openBoxCondition": null,
            "openBoxOptions": null,
            "inStoreServiceType": null,
            "price": {
              "openBoxCondition": null,
              "__typename": "ItemPrice"
            },
            "primaryImage": {
              "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6576/6576719_sd.jpg",
              "__typename": "ProductImage"
            },
            "name": {
              "short": "Dell - Inspiron 14 - 14\" 2K 2-in-1 Touchscreen Laptop - AMD Ryzen 5 8640HS 2023 - 8GB Memory - 512 GB Storage - Midnight Blue",
              "__typename": "ProductName"
            },
            "__typename": "Product",
            "skuId": "6576719"
          },
          "pdpUrl": "https://www.bestbuy.com/product/dell-inspiron-14-14-2k-2-in-1-touchscreen-laptop-amd-ryzen-5-8640hs-2023-8gb-memory-512-gb-storage-mi
  ...
}
```
</details>

### customerVisitorOfferQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "customerVisitorOfferQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "customerVisitorOfferQuery",
  "variables": {
    "deviceChannel": "lv",
    "offerType": "offers"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query customerVisitorOfferQuery($offerType: VisitorOfferTypes!, $deviceChannel: DeviceChannelTypes) {\n  customer {\n    visitorOffer(filter: {offerType: $offerType, deviceChannel: $deviceChannel}) {\n      action {\n        ... on VisitorOfferAction {\n          __typename\n          offerId\n          offerType\n          expirationTs\n          experimentVariants\n          offerStatus\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `deviceChannel` | `"lv"` | string |
| `offerType` | `"offers"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "customer": {
      "visitorOffer": null,
      "__typename": "Customer"
    }
  }
}
```
</details>

### AIV_FulfillmentBatchCall

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "AIV_FulfillmentBatchCall"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "AIV_FulfillmentBatchCall",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query AIV_FulfillmentBatchCall {\n  __typename\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "__typename": "Query"
  }
}
```
</details>

### GetZipCodeByLocationId

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "GetZipCodeByLocationId"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "GetZipCodeByLocationId",
  "variables": {
    "locationId": "1436"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query GetZipCodeByLocationId($locationId: String = \"\") {\n  storeById(locationId: $locationId) {\n    displayName\n    physicalLocation {\n      zipCode\n      __typename\n    }\n    __typename\n    locationId\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `locationId` | `"1436"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "storeById": {
      "displayName": "Owings Mills",
      "physicalLocation": {
        "zipCode": "21117",
        "__typename": "StorePhysicalLocation"
      },
      "__typename": "StoreLocation",
      "locationId": "1436"
    }
  }
}
```
</details>

### CustomerDataQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "CustomerDataQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "CustomerDataQuery",
  "variables": {},
  "query": "query CustomerDataQuery {\n  customer {\n    preferences {\n      identifiers {\n        userToken\n        __typename\n      }\n      __typename\n    }\n    profileLabels {\n      label\n      value\n      __typename\n    }\n    planPaidMembership {\n      activeType\n      __typename\n    }\n    loyalty {\n      ... on CustomerLoyaltyAccount {\n        pointTotal {\n          rewardPointTotal\n          certificatePointTotal\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "customer": {
      "preferences": {
        "identifiers": {
          "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
          "__typename": "CustomerIdentifier"
        },
        "__typename": "CustomerPreference"
      },
      "profileLabels": [
        {
          "label": "LOYALTY_TIER_CORE",
          "value": true,
          "__typename": "CustomerProfileLabel"
        }
      ],
      "planPaidMembership": {
        "activeType": "NULL",
        "__typename": "PlanPaidMembership"
      },
      "loyalty": {
        "pointTotal": {
          "rewardPointTotal": "0",
          "certificatePointTotal": "0",
          "__typename": "CustomerLoyaltyPointsValue"
        },
        "__typename": "CustomerLoyaltyAccount"
      },
      "__typename": "Customer"
    }
  }
}
```
</details>

### GetLocationsByZipCode

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "GetLocationsByZipCode"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "GetLocationsByZipCode",
  "variables": {
    "zipCode": "21117"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query GetLocationsByZipCode($zipCode: String = \"\") {\n  storeLookupByZip(\n    filter: {zipCode: $zipCode, limit: 6, miles: 250, status: OPEN, facilityTypes: \"Big Box,Outlet Center\"}\n  ) {\n    stores {\n      distance\n      storeLocation {\n        displayName\n        locationId\n        status\n        storeType\n        physicalLocation {\n          addr1\n          addr2\n          city\n          state\n          zipCode\n          __typename\n        }\n        hours(type: \"SALES\") {\n          openHours {\n            close\n            open\n            date\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `zipCode` | `"21117"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "storeLookupByZip": {
      "stores": [
        {
          "distance": 0.507904,
          "storeLocation": {
            "displayName": "Owings Mills",
            "locationId": "1436",
            "status": "Open",
            "storeType": "Big Box",
            "physicalLocation": {
              "addr1": "10400 Owings Mills Blvd",
              "addr2": null,
              "city": "Owings Mills",
              "state": "MD",
              "zipCode": "21117",
              "__typename": "StorePhysicalLocation"
            },
            "hours": [
              {
                "openHours": [
                  {
                    "close": "19:00",
                    "open": "11:00",
                    "date": "<redacted>",
                    "__typename": "StoreLocationOpenHour"
                  },
                  {
                    "close": "20:00",
                    "open": "10:00",
                    "date": "<redacted>",
                    "__typename": "StoreLocationOpenHour"
                  },
                  {
                    "close": "20:00",
                    "open": "10:00",
                    "date": "<redacted>",
                    "__typename": "StoreLocationOpenHour"
                  },
                  {
                    "close": "20:00",
                    "open": "10:00",
                    "date": "<redacted>",
                    "__typename": "StoreLocationOpenHour"
                  },
             
  ...
}
```
</details>

### BestMediaV3PdpSbb

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "BestMediaV3PdpSbb"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "BestMediaV3PdpSbb",
  "variables": {
    "pageSkus": "6674708",
    "placements": {
      "minSkus": 1,
      "maxSkus": 10,
      "minSkusForSbb": 1,
      "maxSkusForSbb": 10,
      "name": "PDP_SPONSORED_CAROUSEL_SBB",
      "pageType": "pdp"
    },
    "platform": "L",
    "partyId": "<redacted>",
    "visitorId": "3161e7d0-5497-11f0-bd66-12204ace29a7",
    "storeId": "1436",
    "zipCode": "97230"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query BestMediaV3PdpSbb($pageSkus: [String], $partyId: String, $visitorId: String, $placements: [BestMediaAdsPlacementInput]!, $platform: String!, $storeId: String, $zipCode: String) {\n  bestMediaV3(\n    input: {pageSkus: $pageSkus, partyId: $partyId, placements: $placements, platform: $platform, storeId: $storeId, visitorId: $visitorId, zipcode: $zipCode}\n  ) {\n    placements {\n      name\n      accepted {\n        source\n        onLoadBeaconForSku\n        onClickBeaconForSku\n        onViewBeaconForSku\n        onWishlistBeaconForSku\n        onBasketChangeBeaconForSku\n        name\n        imageUrl\n        campaignId\n        reviewCount\n        sku\n        rating\n        product {\n          url {\n            skuSpecificUrl\n            __typename\n          }\n          __typename\n          skuId\n          openBoxCondition\n        }\n        bsin\n        __typename\n      }\n      onClickBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      onLoadBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      onViewBeaconsForPlacement {\n        beacon\n        source\n        __typename\n      }\n      rejected {\n        reason\n        sku\n        source\n        __typename\n      }\n      rendering {\n        altText\n        desktopBackgroundImage\n        mobileBackgroundImage\n        redirectUrl\n        source\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `pageSkus` | `"6674708"` | string |
| `placements` | `{"minSkus":1,"maxSkus":10,"minSkusForSbb":1,"maxSkusForSb...` | object |
| `platform` | `"L"` | string |
| `partyId` | `"<redacted>"` | string |
| `visitorId` | `"3161e7d0-5497-11f0-bd66-12204ace29a7"` | string |
| `storeId` | `"1436"` | string |
| `zipCode` | `"97230"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "bestMediaV3": {
      "placements": [
        {
          "name": "PDP_SPONSORED_CAROUSEL_SBB",
          "accepted": [],
          "onClickBeaconsForPlacement": [],
          "onLoadBeaconsForPlacement": [],
          "onViewBeaconsForPlacement": [],
          "rejected": [],
          "rendering": null,
          "__typename": "BestMediaAdsPlacement"
        }
      ],
      "__typename": "BestMediaV3Connection"
    }
  }
}
```
</details>

### PVFulfillmentBatchCall_Init

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "PVFulfillmentBatchCall_Init"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "PVFulfillmentBatchCall_Init",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query PVFulfillmentBatchCall_Init {\n  __typename\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "__typename": "Query"
  }
}
```
</details>

### getPDPProductBySkuId

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getPDPProductBySkuId"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "getPDPProductBySkuId",
  "variables": {
    "skuId": "6674708"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query getPDPProductBySkuId($skuId: String!) {\n  productBySkuId(skuId: $skuId) {\n    brand\n    hierarchy {\n      bbypres {\n        primary\n        id\n        categoryDetail {\n          name\n          broaderTerms {\n            primaryLineage {\n              id\n              name\n              sequence\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    name {\n      short\n      __typename\n    }\n    price(input: {salesChannel: \"www\"}) {\n      currentPrice\n      __typename\n    }\n    reviewInfo {\n      averageRating\n      __typename\n    }\n    __typename\n    skuId\n    openBoxCondition\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6674708"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "brand": "Lenovo",
      "hierarchy": {
        "bbypres": [
          {
            "primary": true,
            "id": "pcmcat138500050001",
            "categoryDetail": {
              "name": "All Laptops",
              "broaderTerms": {
                "primaryLineage": [
                  {
                    "id": "abcat0502000",
                    "name": "Laptops",
                    "sequence": 0,
                    "__typename": "HierarchyLineage"
                  },
                  {
                    "id": "abcat0500000",
                    "name": "Computers & Tablets",
                    "sequence": 1,
                    "__typename": "HierarchyLineage"
                  },
                  {
                    "id": "cat00000",
                    "name": "Best Buy",
                    "sequence": 2,
                    "__typename": "HierarchyLineage"
                  }
                ],
                "__typename": "HierarchyBroaderTerms"
              },
              "__typename": "CategoryDetail"
            },
            "__typename": "ProductHierarchyLink"
          }
        ],
        "__typename": "ProductHierarchy"
      },
      "name": {
        "short": "Lenovo - IdeaPad Slim 3 15.3\" 2k Touchscreen Laptop - AMD Ryzen 7 170 2025 - 16GB Memory - 512GB SSD - Luna Grey",
        "__typename": "ProductName"
      },
      "price": {
        "currentPrice": 599.99,
        "__typename": "
  ...
}
```
</details>

### getProductDetail

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getProductDetail"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "getProductDetail",
  "variables": {
    "skuIds": [
      "6549173",
      "6548823"
    ]
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query getProductDetail($skuIds: [String!]!) {\n  productsBySkuIds(skuIds: $skuIds) {\n    ... on Product {\n      skuId\n      brand\n      whatItIs\n      name {\n        short\n        __typename\n      }\n      description {\n        long\n        __typename\n      }\n      primaryImage {\n        piscesHref\n        __typename\n      }\n      __typename\n      openBoxCondition\n    }\n    __typename\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuIds` | `["6549173","6548823"]` | array |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productsBySkuIds": [
      {
        "skuId": "6549173",
        "brand": "Microsoft",
        "whatItIs": [
          "Gift with Purchase",
          "Microsoft Gaming",
          "Video Game Card"
        ],
        "name": {
          "short": "Microsoft - Xbox Game Pass Premium 1 Month Membership – Activation Required [Digital]",
          "__typename": "ProductName"
        },
        "description": {
          "long": "Play Diablo IV, Hogwarts Legacy and 200+ more games on any screen.  Dive into a range of legendary franchises from Call of Duty® to Minecraft and everything in between.  Download and play games on Xbox console, PC and supported handhelds.  Stream games with Cloud Gaming on any supported device, including PC, TV, mobile, tablet and VR headsets. Enjoy 1-month of Xbox Game Pass Premium with your Best Buy purchase and play today.  Eligible for new subscribers only.  Plan auto-renews until cancelled.  $14.99 Value.",
          "__typename": "ProductDescription"
        },
        "primaryImage": {
          "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/351dfc50-238b-4884-9b58-f36e8b4b514a.jpg",
          "__typename": "ProductImage"
        },
        "__typename": "Product",
        "openBoxCondition": null
      },
      {
        "skuId": "6548823",
        "brand": "Norton",
        "whatItIs": [
          "Antivirus and Internet Security Software",
          "Free Trial",
          "Norton Antivirus",
   
  ...
}
```
</details>

### GiftCard_GWPSiteControlTimeline

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "GiftCard_GWPSiteControlTimeline"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "GiftCard_GWPSiteControlTimeline",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query GiftCard_GWPSiteControlTimeline {\n  offer735933: siteControlTimeline(\n    siteControlTimelineInput: {page: \"735933\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer636289: siteControlTimeline(\n    siteControlTimelineInput: {page: \"636289\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer735933",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer735933",
        "timelineID"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": {
    "offer735933": {
      "rows": null,
      "__typename": "SiteControlTimeline",
      "timelineID": null
    },
    "offer636289": {
      "rows": [
        {
          "__typename": "SiteControlRow",
          "columns": [
            {
              "__typename": "SiteControlColumn",
              "widgets": [
                {
                  "content": {
                    "_meta": {
                      "guid": "6c22da91-1a39-4924-8dae-bd81a5f9cc5f",
                      "ignoreOnSmall": []
                    },
                    "backgroundImage": null,
                    "bodyCopy": null,
                    "callToActionButton": null,
                    "callToActionText": null,
                    "disclaimer": null,
                    "disclaimerCallToActionLinkTo": null,
                    "disclaimerCallToActionText": null,
                    "foregroundImage": null,
                    "guid": "5aa1e318-d66c-4528-8db1-b7b61634d9bf",
                    "headline": null,
                    "linkTo": "/site/conditional-offers/s
  ...
}
```
</details>

### PriceExperience_OfferListSiteControlTimeline

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "PriceExperience_OfferListSiteControlTimeline"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "PriceExperience_OfferListSiteControlTimeline",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query PriceExperience_OfferListSiteControlTimeline {\n  offer873929: siteControlTimeline(\n    siteControlTimelineInput: {page: \"873929\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer752472: siteControlTimeline(\n    siteControlTimelineInput: {page: \"752472\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer759129: siteControlTimeline(\n    siteControlTimelineInput: {page: \"759129\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer512227: siteControlTimeline(\n    siteControlTimelineInput: {page: \"512227\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer775653: siteControlTimeline(\n    siteControlTimelineInput: {page: \"775653\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer795607: siteControlTimeline(\n    siteControlTimelineInput: {page: \"795607\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer799781: siteControlTimeline(\n    siteControlTimelineInput: {page: \"799781\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer803492: siteControlTimeline(\n    siteControlTimelineInput: {page: \"803492\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer808318: siteControlTimeline(\n    siteControlTimelineInput: {page: \"808318\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n  offer821378: siteControlTimeline(\n    siteControlTimelineInput: {page: \"821378\", view: \"native\"}\n  ) {\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    __typename\n    timelineID\n  }\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer873929",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer873929",
        "timelineID"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer795607",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer795607",
        "timelineID"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer759129",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer759129",
        "timelineID"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer799781",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "offer7997
  ...
}
```
</details>

### PriceBlock_OffersContentForProductQuery

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "PriceBlock_OffersContentForProductQuery"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "PriceBlock_OffersContentForProductQuery",
  "variables": {
    "siteControlTimelineInput": {
      "page": "873929",
      "view": "native"
    }
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query PriceBlock_OffersContentForProductQuery($siteControlTimelineInput: SiteControlTimelineInput!) {\n  siteControlTimeline(siteControlTimelineInput: $siteControlTimelineInput) {\n    __typename\n    rows {\n      __typename\n      columns {\n        __typename\n        widgets\n      }\n    }\n    timelineID\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `siteControlTimelineInput` | `{"page":"873929","view":"native"}` | object |

<details><summary>Example response</summary>

```json
{
  "errors": [
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "siteControlTimeline",
        "rows"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    },
    {
      "message": "Error - Not Found",
      "locations": [],
      "path": [
        "siteControlTimeline",
        "timelineID"
      ],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": {
    "siteControlTimeline": {
      "__typename": "SiteControlTimeline",
      "rows": null,
      "timelineID": null
    }
  }
}
```
</details>

### getProductHierarchyIdBySkuId

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "getProductHierarchyIdBySkuId"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "getProductHierarchyIdBySkuId",
  "variables": {
    "skuId": "6674708"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query getProductHierarchyIdBySkuId($skuId: String!) {\n  productBySkuId(skuId: $skuId) {\n    hierarchy {\n      bbypres {\n        categoryDetail {\n          broaderTerms {\n            primaryLineage {\n              id\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n    skuId\n    openBoxCondition\n  }\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `skuId` | `"6674708"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "hierarchy": {
        "bbypres": [
          {
            "categoryDetail": {
              "broaderTerms": {
                "primaryLineage": [
                  {
                    "id": "abcat0502000",
                    "__typename": "HierarchyLineage"
                  },
                  {
                    "id": "abcat0500000",
                    "__typename": "HierarchyLineage"
                  },
                  {
                    "id": "cat00000",
                    "__typename": "HierarchyLineage"
                  }
                ],
                "__typename": "HierarchyBroaderTerms"
              },
              "__typename": "CategoryDetail"
            },
            "__typename": "ProductHierarchyLink"
          }
        ],
        "__typename": "ProductHierarchy"
      },
      "__typename": "Product",
      "skuId": "6674708",
      "openBoxCondition": null
    }
  }
}
```
</details>

### ProductCarousels_FulfillmentBatchCall

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "ProductCarousels_FulfillmentBatchCall"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "ProductCarousels_FulfillmentBatchCall",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query ProductCarousels_FulfillmentBatchCall {\n  __typename\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "__typename": "Query"
  }
}
```
</details>

### URE_FetchRecommendations

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "URE_FetchRecommendations"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "URE_FetchRecommendations",
  "variables": {
    "placement": "pdp-ure",
    "site": "dotcom-l",
    "skuId": "6674708",
    "relatedProductsCount": 2,
    "additionalMinRelatedProductsCount": 1,
    "groupIds": "",
    "limit": 15,
    "storeId": "1436",
    "planPaidMembershipEffectiveType": "NULL",
    "salesChannel": "LargeView",
    "partyToken": "",
    "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
    "visitorToken": "3161e7d0-5497-11f0-bd66-12204ace29a7",
    "usePriceWithCart": true,
    "cartTimestamp": "<redacted>"
  },
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query URE_FetchRecommendations($placement: String!, $site: String!, $skuId: String!, $relatedProductsCount: Int!, $additionalMinRelatedProductsCount: Int!, $groupIds: String!, $limit: Int!, $storeId: String!, $planPaidMembershipEffectiveType: String, $salesChannel: String!, $partyToken: String, $userToken: String, $visitorToken: String, $usePriceWithCart: Boolean!, $cartTimestamp: String!) {\n  productBySkuId(skuId: $skuId) {\n    whatItIs\n    __typename\n    skuId\n    openBoxCondition\n  }\n  recommendationsByGroup(\n    input: {placement: $placement, site: $site, skus: [$skuId], relatedProductsCount: $relatedProductsCount, additionalMinRelatedProductsCount: $additionalMinRelatedProductsCount, groupIds: $groupIds, limit: $limit, storeIds: [$storeId]}\n    identity: {partyId: $partyToken, ut: $userToken, vt: $visitorToken}\n  ) {\n    id\n    relatedGroups {\n      title\n      ...Subgroups\n      __typename\n    }\n    relatedProducts {\n      ...RelatedProducts\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment Price on Product {\n  price(\n    input: {salesChannel: $salesChannel, planPaidMemberType: $planPaidMembershipEffectiveType, usePriceWithCart: $usePriceWithCart, cartTimestamp: $cartTimestamp, visitorId: $visitorToken, customerId: $userToken}\n  ) {\n    icrCode\n    isMAP\n    regularPrice\n    currentPrice\n    customerPrice\n    totalSavings\n    totalSavingsPercent\n    preferredBadging\n    strictMapIcr\n    regularPriceMessageType\n    saleEventMessageType\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment PrimaryImage on Product {\n  primaryImage {\n    piscesHref\n    altText\n    __typename\n  }\n  __typename\n  skuId\n  openBoxCondition\n}\n\nfragment Subgroups on RecommendationRelatedGroup {\n  title\n  subgroups {\n    name\n    id\n    ep\n    order\n    skus\n    item {\n      ... on Product {\n        skuId\n        ...PrimaryImage\n        __typename\n        openBoxCondition\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment RelatedProducts on RecommendationRelatedProduct {\n  name\n  id\n  ep\n  order\n  recommendations {\n    id\n    ep\n    rank\n    item {\n      ... on Product {\n        name {\n          short\n          __typename\n        }\n        url {\n          skuSpecificUrl\n          relativePdp\n          __typename\n        }\n        whatItIs\n        skuId\n        reviewInfo {\n          reviewCount\n          averageRating\n          recommendedPercent\n          __typename\n        }\n        ...PrimaryImage\n        ...Price\n        __typename\n        openBoxCondition\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}"
}'
```

**Variables:**

| Name | Example | Type |
|---|---|---|
| `placement` | `"pdp-ure"` | string |
| `site` | `"dotcom-l"` | string |
| `skuId` | `"6674708"` | string |
| `relatedProductsCount` | `2` | number |
| `additionalMinRelatedProductsCount` | `1` | number |
| `groupIds` | `""` | string |
| `limit` | `15` | number |
| `storeId` | `"1436"` | string |
| `planPaidMembershipEffectiveType` | `"NULL"` | string |
| `salesChannel` | `"LargeView"` | string |
| `partyToken` | `""` | string |
| `userToken` | `"8217524d-4fb4-11f1-a701-0e79396342ad"` | string |
| `visitorToken` | `"3161e7d0-5497-11f0-bd66-12204ace29a7"` | string |
| `usePriceWithCart` | `true` | boolean |
| `cartTimestamp` | `"<redacted>"` | string |

<details><summary>Example response</summary>

```json
{
  "data": {
    "productBySkuId": {
      "whatItIs": [
        "Laptop Computer"
      ],
      "__typename": "Product",
      "skuId": "6674708",
      "openBoxCondition": null
    },
    "recommendationsByGroup": {
      "id": "JJGH3KQYP8",
      "relatedGroups": {
        "title": "More recommended items",
        "subgroups": [
          {
            "name": "Office Software",
            "id": "Office Software",
            "ep": "av-ure.llmrefined,dr-JJGH3KQYP8,ds-ps,enh-pof_raf,grp-Office Software,opt-noop,pc-1,plmt-pdp-ure,rc-stratified,rid-g2TB9m8C0J2-ejg2TU9MrWi-2426,s-l,srk-1",
            "order": 1,
            "skus": [
              "6630534"
            ],
            "item": {
              "skuId": "6630534",
              "primaryImage": {
                "piscesHref": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/1a3ca6db-e1d3-4e1f-a121-21728ec455e7.jpg",
                "altText": "Microsoft 365 now includes Copilot Personal. This subscription offers a 3-month subscription for one user, with access to Word, Excel, and PowerPoint.",
                "__typename": "ProductImage"
              },
              "__typename": "Product",
              "openBoxCondition": null
            },
            "__typename": "RecommendationSubgroup"
          },
          {
            "name": "Laptop Bags and Cases",
            "id": "Laptop Bags and Cases",
            "ep": "av-ure.llmrefined,dr-JJGH3KQYP8,ds-ps,enh-pof_raf,grp-Laptop Bags and C
  ...
}
```
</details>

### URE_FetchButtonStates

- **Endpoint:** `POST /gateway/graphql`
- **Discriminator:** `operationName: "URE_FetchButtonStates"`
- **Samples:** 1 | **Statuses:** 200

```bash
curl -X POST 'https://www.bestbuy.com/gateway/graphql' \
  -H 'Content-Type: application/json' \
  -d '{
  "operationName": "URE_FetchButtonStates",
  "variables": {},
  "extensions": {
    "clientLibrary": {
      "name": "@apollo/client",
      "version": "4.1.6"
    }
  },
  "query": "query URE_FetchButtonStates {\n  __typename\n}"
}'
```

<details><summary>Example response</summary>

```json
{
  "data": {
    "__typename": "Query"
  }
}
```
</details>

## Endpoints

| Method | Path | Samples | Statuses | Confidence |
|---|---|---|---|---|
| GET | `/gateway/graphql/fulfillment` | 10 | 200 | low |
| POST | `/awacs-ingestor/api/cload` | 8 | 200 | low |
| POST | `/streams/v1/consume` | 7 | 200 | low |
| POST | `/ugc/v1/write-a-review` | 2 | 200 | low |
| POST | `/awacs-ingestor/api/unfilled` | 2 | 200 | low |
| GET | `/~assets/bby/_com/libs/goteam/v26.16.2.js` | 1 | 200 | low |
| GET | `/deo-configfile/v1/configfiles` | 1 | 200 | low |
| GET | `/api/tcfb/model.json` | 1 | 200 | low |
| GET | `/streams/v1/SEARCH_TERM` | 1 | 200 | low |
| POST | `/awacs-ingestor/api/airport` | 1 | 200 | low |
| POST | `/services/conversation/web/api/v1/unified-chat/logger` | 1 | 200 | low |

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

### `POST /awacs-ingestor/api/cload`

```bash
curl -X POST 'https://www.bestbuy.com/awacs-ingestor/api/cload' \
  -H 'Content-Type: application/json' \
  -d '{
  "component": "NINJA",
  "componentId": "4e4da4c6-bccc-4fde-a0ed-a6fb3c1c41fe",
  "componentInstanceId": "undefined",
  "componentVersion": "0.73.0",
  "deviceAndBrowser": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
  "event": "CLOAD",
  "mversion": 1,
  "pageType": "PDP",
  "partyId": "<redacted>",
  "platform": "L",
  "sessionId": "1c4a7049-5345-400a-af37-ad3f937d8f99",
  "userId": "a4e56918-fc43-46a3-a65f-abce7625852a",
  "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
  "visitorId": "e616ea95-4828-4b2a-a078-2bf0bb59f33c",
  "breadcrumb": "/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_laptops",
  "keywords": "All Laptops",
  "pageTransactionId": "7e3b6204-6c8a-40b4-ac3d-574d9eaf7888",
  "pageSkuId": "6674708",
  "pageCategoryId": ""
}'
```

<details><summary>Example response</summary>

```json
{
  "pageNumber": 0,
  "componentId": "4e4da4c6-bccc-4fde-a0ed-a6fb3c1c41fe",
  "skuPosition": 0,
  "awacsId": "",
  "keywords": "All Laptops",
  "carouselSize": 0,
  "mtimestamp": "<redacted>",
  "pageSkuId": "6674708",
  "pageSize": 0,
  "skuIds": "",
  "orderItems": [],
  "platform": "L",
  "facets": "",
  "mtype": "CLOAD",
  "pageCategoryId": "",
  "pageType": "PDP",
  "componentInstanceId": "undefined",
  "id": "<redacted>",
  "event": "CLOAD",
  "mversion": 1,
  "componentVersion": "0.73.0",
  "deviceAndBrowser": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
  "sessionId": "1c4a7049-5345-400a-af37-ad3f937d8f99",
  "userId": "a4e56918-fc43-46a3-a65f-abce7625852a",
  "blueprint": "",
  "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
  "component": "NINJA",
  "breadcrumb": "/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_laptops",
  "placement": "DEFAULT",
  "items": [],
  "visitorId": "e616ea95-4828-
  ...
}
```
</details>

### `POST /streams/v1/consume`

```bash
curl -X POST 'https://www.bestbuy.com/streams/v1/consume' \
  -H 'Content-Type: application/json' \
  -d '{
  "eventType": "RECENTLY_VIEWED",
  "skuId": "6674708"
}'
```

### `POST /ugc/v1/write-a-review`

```bash
curl -X POST 'https://www.bestbuy.com/ugc/v1/write-a-review' \
  -H 'Content-Type: application/json' \
  -d '{
  "skus": [
    "6674708"
  ],
  "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
  "campaignId": "campaignId"
}'
```

<details><summary>Example response</summary>

```json
{
  "partyId": "<redacted>",
  "products": [
    {
      "isReviewable": false,
      "sku": "6674708"
    }
  ]
}
```
</details>

### `POST /awacs-ingestor/api/unfilled`

```bash
curl -X POST 'https://www.bestbuy.com/awacs-ingestor/api/unfilled' \
  -H 'Content-Type: application/json' \
  -d '{
  "component": "NINJA_CAROUSEL",
  "componentId": "d4549efc-e021-4987-a237-32634b806995",
  "componentInstanceId": "",
  "componentVersion": "0.73.0",
  "mversion": 1,
  "pageNumber": 1,
  "pageType": "PDP",
  "pageSkuId": "6674708",
  "event": "UNFILLED",
  "carouselSize": 0,
  "impressionsUnfilled": 1,
  "pageCategoryId": "",
  "reasons": [
    {
      "sku": "0",
      "reason": "NO_CONTENT",
      "source": ""
    }
  ],
  "items": [],
  "deviceAndBrowser": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
  "pageTransactionId": "7e3b6204-6c8a-40b4-ac3d-574d9eaf7888",
  "partyId": "<redacted>",
  "platform": "L",
  "sessionId": "1c4a7049-5345-400a-af37-ad3f937d8f99",
  "userId": "a4e56918-fc43-46a3-a65f-abce7625852a",
  "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
  "visitorId": "e616ea95-4828-4b2a-a078-2bf0bb59f33c",
  "breadcrumb": "/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_laptops",
  "keywords": "All Laptops"
}'
```

<details><summary>Example response</summary>

```json
{
  "reasons": [
    {
      "reason": "NO_CONTENT",
      "sku": "0"
    }
  ],
  "componentId": "d4549efc-e021-4987-a237-32634b806995",
  "pageNumber": 1,
  "awacsId": "",
  "keywords": "All Laptops",
  "impressionsUnfilled": 1,
  "carouselSize": 0,
  "mtimestamp": "<redacted>",
  "pageSkuId": "6674708",
  "pageSize": 0,
  "orderItems": [],
  "platform": "L",
  "facets": "",
  "mtype": "UNFILLED",
  "pageCategoryId": "",
  "pageType": "PDP",
  "id": "<redacted>",
  "componentInstanceId": "",
  "event": "UNFILLED",
  "mversion": 1,
  "deviceAndBrowser": "Mozilla5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit537.36 (KHTML like Gecko) Chrome147.0.0.0 Safari537.36",
  "componentVersion": "0.73.0",
  "sessionId": "1c4a7049-5345-400a-af37-ad3f937d8f99",
  "userId": "a4e56918-fc43-46a3-a65f-abce7625852a",
  "blueprint": "",
  "userToken": "8217524d-4fb4-11f1-a701-0e79396342ad",
  "component": "NINJA_CAROUSEL",
  "breadcrumb": "/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_lapt
  ...
}
```
</details>

## Coverage

- **47** API endpoints discovered
- **3** missing response-body schemas
- **36** observed only once

