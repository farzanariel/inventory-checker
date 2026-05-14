// Auto-generated API client from browser-trace capture.
// Usage: import {  } from './client.mjs';

const BASE = 'https://www.bestbuy.com';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  ':authority': 'www.bestbuy.com',
  ':method': 'GET',
  ':path': '/gateway/graphql/fulfillment?variables=%7B%22fulfillmentOptionsInput%22%3A%7B%22sku%22%3A%226674708%22%2C%22shipping%22%3A%7B%22destinationZipCode%22%3A%2297230%22%7D%2C%22inStorePickup%22%3A%7B%22storeId%22%3A%221436%22%7D%2C%22buttonState%22%3A%7B%22storeId%22%3A%221436%22%2C%22destinationZipCode%22%3A%2297230%22%2C%22context%22%3A%22PDP%22%2C%22fulfillmentOption%22%3A%22SHIPPING%22%7D%7D%7D',
  ':scheme': 'https',
  'cache-control': 'no-cache',
  'dnt': '1',
  'pragma': 'no-cache',
  'priority': 'u=1, i',
  'true-client-ip': '172.56.33.147',
  'x-akamai-edgescape': 'georegion=262,country_code=US,region_code=MD,city=BALTIMORE,dma=512,pmsa=0720,msa=8872,areacode=410,county=BALTIMORECITY+ANNEARUNDEL,fips=24510+24003+24005,lat=39.2940,long=-76.6226,timezone=EST,zip=21201-21203+21205-21206+21209-21218+21223-21224+21229-21231+21233+21235+21239-21241+21250-21252+21263-21264+21270+21273+21275+21278-21282+21284-21285+21287-21290+21297-21298,continent=NA,throughput=vhigh,bw=5000,network=tmobile,asnum=21928,network_type=mobile,location_id=0',
  'x-client-id': 'pdp-web',
  'x-dynatrace': '',
  'x-page-request-id': 'a3886109-d8f9-4ccd-b4cc-6a07c68fb35a',
  'x-request-id': 'xrequest::1778777474::23.215.61.234::895c25b6::1597550',
  'x-requested-for-operation-name': 'PageLoadAnalyticsData_Init_Pdp',
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

export async function getgateway_graphql_fulfillment(options = {}) {
  return request('/gateway/graphql/fulfillment', {
    method: 'GET',
    ...options,
  });
}

