// Auto-generated API client from browser-trace capture.
// Usage: import { getBbyApolloClientInternalConfig, customerData, cartQuery, ... } from './client.mjs';

const BASE = 'https://www.bestbuy.com';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  ':authority': 'www.bestbuy.com',
  ':method': 'GET',
  ':path': '/~assets/bby/_com/libs/goteam/v26.16.2.js',
  ':scheme': 'https',
  'cache-control': 'no-cache',
  'dnt': '1',
  'pragma': 'no-cache',
  'priority': 'u=1',
  'true-client-ip': '172.56.33.147',
  'x-akamai-edgescape': 'georegion=262,country_code=US,region_code=MD,city=BALTIMORE,dma=512,pmsa=0720,msa=8872,areacode=410,county=BALTIMORECITY+ANNEARUNDEL,fips=24510+24003+24005,lat=39.2940,long=-76.6226,timezone=EST,zip=21201-21203+21205-21206+21209-21218+21223-21224+21229-21231+21233+21235+21239-21241+21250-21252+21263-21264+21270+21273+21275+21278-21282+21284-21285+21287-21290+21297-21298,continent=NA,throughput=vhigh,bw=5000,network=tmobile,asnum=21928,network_type=mobile,location_id=0',
  'x-client-id': 'pdp-web, pdp-web',
  'x-dynatrace': '',
  'x-page-request-id': 'ba7301fa-d8a6-4828-a9db-6fc6983a6c40',
  'x-request-id': 'xrequest::1778777876::23.215.61.231::18f86753::1597550',
  'x-requested-for-operation-name': 'CustomerData',
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

/**
 * @param {string} variables.id
 * @returns {Promise<object>}
 */
export async function getBbyApolloClientInternalConfig(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getBbyApolloClientInternalConfig', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function customerData(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'CustomerData', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function cartQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'CartQuery', variables },
  });
}

/**
 * @param {boolean} variables.isBestbuyMember
 * @param {string} variables.skuId
 * @param {object} variables.input
 * @param {boolean} variables.isBadgeEnabled
 * @param {boolean} variables.isBadgeV2Enabled
 * @param {object} variables.bsinBuyingOptionsInput
 * @returns {Promise<object>}
 */
export async function pageLoadAnalyticsData_Init_Pdp(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'PageLoadAnalyticsData_Init_Pdp', variables },
  });
}

/**
 * @param {string} variables.pageSkus
 * @param {string} variables.partyId
 * @param {object} variables.placements
 * @param {string} variables.platform
 * @param {string} variables.salesChannel
 * @param {string} variables.storeId
 * @param {string} variables.userAgent
 * @param {string} variables.visitorId
 * @param {string} variables.zipcode
 * @returns {Promise<object>}
 */
export async function getSpotlightAd(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'GetSpotlightAd', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function myQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'MyQuery', variables },
  });
}

/**
 * @param {string} variables.catalog
 * @param {string} variables.type
 * @param {string} variables.id
 * @returns {Promise<object>}
 */
export async function managedContentByTypeAndId(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'managedContentByTypeAndId', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @param {string} variables.membershipTier
 * @param {*} variables.openBoxCondition
 * @param {string} variables.salesChannel
 * @param {string} variables.key
 * @returns {Promise<object>}
 */
export async function warrantySelector_CustomerPriceAndButtonState(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'WarrantySelector_CustomerPriceAndButtonState', variables },
  });
}

/**
 * @param {string} variables.deviceClass
 * @param {string} variables.aiv
 * @param {string} variables.nodeId
 * @param {string} variables.key
 * @param {string} variables.driverSkuId
 * @returns {Promise<object>}
 */
export async function accessoriesInVariations_ConfigData(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'AccessoriesInVariations_ConfigData', variables },
  });
}

/**
 * @param {string} variables.placement
 * @param {string} variables.site
 * @param {number} variables.limit
 * @param {string} variables.skuId
 * @returns {Promise<object>}
 */
export async function getCompareProduct(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'GetCompareProduct', variables },
  });
}

/**
 * @param {string} variables.componentName
 * @param {string} variables.driverSkuId
 * @param {string} variables.deviceClass
 * @param {string} variables.nodeId
 * @returns {Promise<object>}
 */
export async function recommendationsComponentExperienceQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'RecommendationsComponentExperienceQuery', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function __unknown__(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: '__unknown__', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function bBYServiceWorkerConfig(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'BBYServiceWorkerConfig', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @param {number} variables.warrantyPrice
 * @param {boolean} variables.hasPaidMembership
 * @param {string} variables.membershipTier
 * @param {*} variables.openBoxCondition
 * @returns {Promise<object>}
 */
export async function warrantySelector_AssociatedWarranties(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'WarrantySelector_AssociatedWarranties', variables },
  });
}

/**
 * @param {string} variables.driverSkuId
 * @param {string} variables.site
 * @param {string} variables.placementAIV
 * @param {boolean} variables.isBestbuyMember
 * @param {string} variables.planPaidMembership
 * @param {Array} variables.customerAttributes
 * @param {boolean} variables.isMarketPlace
 * @param {string} variables.cartTimestamp
 * @param {string} variables.ut
 * @param {string} variables.vt
 * @returns {Promise<object>}
 */
export async function accessoriesInVariations_FetchData(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'AccessoriesInVariations_FetchData', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @returns {Promise<object>}
 */
export async function reviewStats_Init(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'ReviewStats_Init', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @returns {Promise<object>}
 */
export async function getProduct(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getProduct', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @param {object} variables.productPriceInput
 * @returns {Promise<object>}
 */
export async function addToCart_FulfillmentDynamicQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'AddToCart_FulfillmentDynamicQuery', variables },
  });
}

/**
 * @param {string} variables.deviceChannel
 * @param {string} variables.offerType
 * @returns {Promise<object>}
 */
export async function customerVisitorOfferQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'customerVisitorOfferQuery', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @param {boolean} variables.enableRedirectToNewRnR
 * @returns {Promise<object>}
 */
export async function ratingsAndReviewsRequiredData(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'RatingsAndReviewsRequiredData', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function aIV_FulfillmentBatchCall(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'AIV_FulfillmentBatchCall', variables },
  });
}

/**
 * @param {string} variables.locationId
 * @returns {Promise<object>}
 */
export async function getZipCodeByLocationId(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'GetZipCodeByLocationId', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function customerDataQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'CustomerDataQuery', variables },
  });
}

/**
 * @param {string} variables.zipCode
 * @returns {Promise<object>}
 */
export async function getLocationsByZipCode(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'GetLocationsByZipCode', variables },
  });
}

/**
 * @param {string} variables.pageSkus
 * @param {object} variables.placements
 * @param {string} variables.platform
 * @param {string} variables.partyId
 * @param {string} variables.visitorId
 * @param {string} variables.storeId
 * @param {string} variables.zipCode
 * @returns {Promise<object>}
 */
export async function bestMediaV3PdpSbb(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'BestMediaV3PdpSbb', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function pVFulfillmentBatchCall_Init(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'PVFulfillmentBatchCall_Init', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @returns {Promise<object>}
 */
export async function getPDPProductBySkuId(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getPDPProductBySkuId', variables },
  });
}

/**
 * @param {Array} variables.skuIds
 * @returns {Promise<object>}
 */
export async function getProductDetail(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getProductDetail', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function giftCard_GWPSiteControlTimeline(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'GiftCard_GWPSiteControlTimeline', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function priceExperience_OfferListSiteControlTimeline(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'PriceExperience_OfferListSiteControlTimeline', variables },
  });
}

/**
 * @param {object} variables.siteControlTimelineInput
 * @returns {Promise<object>}
 */
export async function priceBlock_OffersContentForProductQuery(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'PriceBlock_OffersContentForProductQuery', variables },
  });
}

/**
 * @param {string} variables.partyId
 * @param {Array} variables.pageSkus
 * @param {object} variables.placements
 * @param {string} variables.platform
 * @param {string} variables.referer
 * @param {string} variables.storeId
 * @param {string} variables.userAgent
 * @param {string} variables.visitorId
 * @param {string} variables.xForwardedFor
 * @param {string} variables.zipcode
 * @param {string} variables.salesChannel
 * @returns {Promise<object>}
 */
export async function getMediationLayerForNonPLP(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getMediationLayerForNonPLP', variables },
  });
}

/**
 * @param {string} variables.skuId
 * @returns {Promise<object>}
 */
export async function getProductHierarchyIdBySkuId(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'getProductHierarchyIdBySkuId', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function productCarousels_FulfillmentBatchCall(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'ProductCarousels_FulfillmentBatchCall', variables },
  });
}

/**
 * @param {string} variables.placement
 * @param {string} variables.site
 * @param {string} variables.skuId
 * @param {number} variables.relatedProductsCount
 * @param {number} variables.additionalMinRelatedProductsCount
 * @param {string} variables.groupIds
 * @param {number} variables.limit
 * @param {string} variables.storeId
 * @param {string} variables.planPaidMembershipEffectiveType
 * @param {string} variables.salesChannel
 * @param {string} variables.partyToken
 * @param {string} variables.userToken
 * @param {string} variables.visitorToken
 * @param {boolean} variables.usePriceWithCart
 * @param {string} variables.cartTimestamp
 * @returns {Promise<object>}
 */
export async function uRE_FetchRecommendations(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'URE_FetchRecommendations', variables },
  });
}

/**
 * @returns {Promise<object>}
 */
export async function uRE_FetchButtonStates(variables = {}) {
  return request('/gateway/graphql', {
    method: 'POST',
    body: { operationName: 'URE_FetchButtonStates', variables },
  });
}

export async function get_assets_bby__com_libs_goteam_v26_16_2_js(options = {}) {
  return request('/~assets/bby/_com/libs/goteam/v26.16.2.js', {
    method: 'GET',
    ...options,
  });
}

export async function getdeo_configfile_v1_configfiles(options = {}) {
  return request('/deo-configfile/v1/configfiles', {
    method: 'GET',
    ...options,
  });
}

export async function postugc_v1_write_a_review(body, options = {}) {
  return request('/ugc/v1/write-a-review', {
    method: 'POST',
    body,
    ...options,
  });
}

export async function getgateway_graphql_fulfillment(options = {}) {
  return request('/gateway/graphql/fulfillment', {
    method: 'GET',
    ...options,
  });
}

export async function poststreams_v1_consume(body, options = {}) {
  return request('/streams/v1/consume', {
    method: 'POST',
    body,
    ...options,
  });
}

export async function getapi_tcfb_model_json(options = {}) {
  return request('/api/tcfb/model.json', {
    method: 'GET',
    ...options,
  });
}

export async function getstreams_v1_SEARCH_TERM(options = {}) {
  return request('/streams/v1/SEARCH_TERM', {
    method: 'GET',
    ...options,
  });
}

export async function postawacs_ingestor_api_cload(body, options = {}) {
  return request('/awacs-ingestor/api/cload', {
    method: 'POST',
    body,
    ...options,
  });
}

export async function postawacs_ingestor_api_airport(body, options = {}) {
  return request('/awacs-ingestor/api/airport', {
    method: 'POST',
    body,
    ...options,
  });
}

export async function postawacs_ingestor_api_unfilled(body, options = {}) {
  return request('/awacs-ingestor/api/unfilled', {
    method: 'POST',
    body,
    ...options,
  });
}

export async function postservices_conversation_web_api_v1_unified_chat_logger(body, options = {}) {
  return request('/services/conversation/web/api/v1/unified-chat/logger', {
    method: 'POST',
    body,
    ...options,
  });
}

