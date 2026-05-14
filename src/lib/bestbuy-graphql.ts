/**
 * GraphQL-over-GET product metadata fallback for Best Buy's newer
 * product-family catalog.
 *
 * priceBlocks is still the fast path. This module is only for SKUs that
 * priceBlocks reports as ProductNotFound/ProductInactive but Best Buy's
 * storefront still serves through `/gateway/graphql`.
 */

import type { ProductResult } from "./bestbuy";
import { productUrlForSku } from "./bestbuy";
import { tlsJsonGet } from "./bestbuy-tls";

const BESTBUY_ORIGIN = "https://www.bestbuy.com";
const GRAPHQL_PATH = "/gateway/graphql";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 2;

export type BestBuyProductDetails =
  | {
      ok: true;
      sku: string;
      name: string;
      brand?: string;
      currentPriceCents: number;
      regularPriceCents?: number;
      imageUrl?: string;
      canonicalUrl: string;
    }
  | { ok: false; sku: string; error: string };

type GraphqlProduct = {
  skuId?: string;
  brand?: string | null;
  name?: { short?: string | null } | null;
  primaryImage?: { piscesHref?: string | null } | null;
  price?: {
    currentPrice?: number | null;
    regularPrice?: number | null;
    displayableCustomerPrice?: number | null;
    displayableRegularPrice?: number | null;
  } | null;
  url?: {
    skuSpecificUrl?: string | null;
    relativePdp?: string | null;
  } | null;
  buyingOptions?: Array<{ pdpUrl?: string | null; type?: string | null }> | null;
};

type GraphqlResponse =
  | {
      ok: true;
      status: number;
      body: {
        data?: {
          productBySkuId?: GraphqlProduct | null;
        };
        errors?: Array<{ message?: string }>;
      };
    }
  | { ok: false; status?: number; error: string; bodyText?: string };

const PRODUCT_QUERY = `query getProduct($skuId: String!, $openBoxCondition: Int) {
  productBySkuId(skuId: $skuId, openBoxCondition: $openBoxCondition) {
    skuId
    brand
    buyingOptions {
      pdpUrl
      type
      __typename
    }
    name {
      short
      __typename
    }
    primaryImage {
      piscesHref
      __typename
    }
    url {
      relativePdp
      skuSpecificUrl
      __typename
    }
    price(input: {salesChannel: "LargeView", usePriceWithCart: true, useCabo: true, useSuco: true}) {
      currentPrice
      regularPrice
      displayableCustomerPrice
      displayableRegularPrice
      skuId
      __typename
    }
    __typename
    openBoxCondition
  }
}`;

function cents(price: number | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price)
    ? Math.round(price * 100)
    : undefined;
}

function canonicalUrlForProduct(product: GraphqlProduct, sku: string): string {
  const newBuyingOption = product.buyingOptions?.find((o) => o?.type === "New");
  const pdpUrl =
    newBuyingOption?.pdpUrl ??
    product.buyingOptions?.find((o) => typeof o?.pdpUrl === "string")?.pdpUrl ??
    product.url?.skuSpecificUrl;

  if (typeof pdpUrl === "string" && pdpUrl.length > 0) return pdpUrl;

  const relative = product.url?.relativePdp;
  if (typeof relative === "string" && relative.length > 0) {
    return relative.startsWith("http") ? relative : `${BESTBUY_ORIGIN}${relative}`;
  }

  return productUrlForSku(sku);
}

function parseProductDetails(
  sku: string,
  response: GraphqlResponse,
): BestBuyProductDetails {
  if (!response.ok) {
    return {
      ok: false,
      sku,
      error: `graphql: ${response.error}`,
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, sku, error: `graphql: HTTP ${response.status}` };
  }

  const product = response.body.data?.productBySkuId;
  if (!product) {
    const message = response.body.errors?.find((e) => e.message)?.message;
    return {
      ok: false,
      sku,
      error: message ? `graphql: ${message}` : "graphql: missing product",
    };
  }

  const name = product.name?.short;
  const currentPrice =
    cents(product.price?.currentPrice) ??
    cents(product.price?.displayableCustomerPrice);

  if (typeof name !== "string" || name.length === 0 || currentPrice == null) {
    return {
      ok: false,
      sku,
      error: `graphql: incomplete product (name=${typeof name}, price=${typeof currentPrice})`,
    };
  }

  const result: BestBuyProductDetails = {
    ok: true,
    sku: product.skuId ?? sku,
    name,
    currentPriceCents: currentPrice,
    canonicalUrl: canonicalUrlForProduct(product, sku),
  };

  if (typeof product.brand === "string" && product.brand.length > 0) {
    result.brand = product.brand;
  }

  const regularPrice =
    cents(product.price?.regularPrice) ??
    cents(product.price?.displayableRegularPrice);
  if (regularPrice != null) {
    result.regularPriceCents = regularPrice;
  }

  const imageUrl = product.primaryImage?.piscesHref;
  if (typeof imageUrl === "string" && imageUrl.length > 0) {
    result.imageUrl = imageUrl;
  }

  return result;
}

function shouldRetry(response: BestBuyProductDetails): boolean {
  if (response.ok) return false;
  return /HTTP (403|408|429|5\d\d)|invalid JSON|timed out|timeout|ECONNRESET|socket|stream/i.test(
    response.error,
  );
}

async function fetchOneProductDetails(sku: string): Promise<BestBuyProductDetails> {
  const params = new URLSearchParams({
    operationName: "getProduct",
    variables: JSON.stringify({ skuId: sku }),
    extensions: JSON.stringify({
      clientLibrary: {
        name: "@apollo/client",
        version: "4.1.6",
      },
    }),
    query: PRODUCT_QUERY,
  });
  const url = `${BESTBUY_ORIGIN}${GRAPHQL_PATH}?${params.toString()}`;

  let last: BestBuyProductDetails = {
    ok: false,
    sku,
    error: "graphql: not attempted",
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await tlsJsonGet(
        url,
        Number(process.env.BESTBUY_GRAPHQL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
      );
      let body: Extract<GraphqlResponse, { ok: true }>["body"];
      try {
        body = JSON.parse(r.body) as Extract<GraphqlResponse, { ok: true }>["body"];
      } catch {
        last = {
          ok: false,
          sku,
          error: "graphql: invalid JSON response",
        };
        if (attempt < MAX_ATTEMPTS && shouldRetry(last)) continue;
        return last;
      }

      last = parseProductDetails(sku, {
        ok: true,
        status: r.statusCode,
        body,
      });
      if (last.ok || attempt === MAX_ATTEMPTS || !shouldRetry(last)) {
        return last;
      }
    } catch (err) {
      last = {
        ok: false,
        sku,
        error: `graphql: ${err instanceof Error ? err.message : String(err)}`,
      };
      if (attempt === MAX_ATTEMPTS || !shouldRetry(last)) return last;
    }

    await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));
  }

  return last;
}

export async function fetchProductDetailsViaGraphql(
  skus: string[],
): Promise<Map<string, BestBuyProductDetails>> {
  const results = new Map<string, BestBuyProductDetails>();
  if (skus.length === 0) return results;

  let index = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= skus.length) return;
      const sku = skus[i];
      results.set(sku, await fetchOneProductDetails(sku));
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT, skus.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  for (const sku of skus) {
    if (!results.has(sku)) {
      results.set(sku, { ok: false, sku, error: "graphql: missing response" });
    }
  }

  return results;
}

export function mergeProductDetailsIntoResult(
  stockResult: ProductResult,
  details: BestBuyProductDetails | undefined,
): ProductResult {
  if (!stockResult.ok || !details?.ok) return stockResult;

  return {
    ...stockResult,
    name: details.name,
    brand: details.brand,
    currentPriceCents: details.currentPriceCents,
    regularPriceCents: details.regularPriceCents,
    imageUrl: details.imageUrl,
    canonicalUrl: details.canonicalUrl,
  };
}

export function _resetGraphqlWarmStateForTest(): void {
  // Kept for compatibility with test helpers; session state lives in bestbuy-tls.
}
