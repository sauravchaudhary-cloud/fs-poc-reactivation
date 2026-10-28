// What the AI can look up at FoodStories (BOT.md, "What the AI reads"), keyed by the phone the message came from and
// its store, never by anything the model says: products, prices and stock live from the site's catalogue; a customer
// and their basket from FoodStories' own endpoint, a sample basket until it exists. Server-only.
import { RESTRICTED } from "./guardrails.ts";

export type Product = {
  name: string;
  price_inr: number;
  in_stock: boolean;
  url: string;
  image?: string; // for its card, never shown to the model
};
export type Basket = {
  lines: { name: string; qty: number; unit_price_inr: number; in_stock: boolean }[]; // a line's price is each
  url: string;
};
// A basket moved to another store; `missing` is what that store doesn't sell, left out.
export type Moved = Basket & { missing: string[] };
// What an add put in the basket, what had sold out by then (`out`), and what the store doesn't sell (`missing`).
export type Added = {
  added: { name: string; qty: number; unit_price_inr: number }[];
  out: string[];
  missing: string[];
  url: string;
};
export type Customer = { name?: string; store?: string };

// A product as the catalogue returns it.
type Item = {
  __typename: string;
  sku: string;
  name: string;
  url_key: string;
  stock_status: string;
  price_range: { minimum_price: { final_price: { value: number } } };
  small_image?: { url?: string } | null;
};

const SITE = "https://www.foodstories.shop";
const CART = SITE + "/checkout/cart/";
const GRAPHQL = "https://api.foodstories.shop/graphql";

// The stores with their own stock on the site (a Magento store view each; the codes are the site's own, from
// STORE_REGION_ID_MAP in its scripts). A flow's store name or a customer's store code maps to one; anything else to the
// site's default, Vasant Kunj. The site's map also has mumbai_powai, which the catalogue errors on (Oct 2026).
export const STORES = [
  { code: "vasantkunj", name: "Vasant Kunj, New Delhi" },
  { code: "hyderabad", name: "Banjara Hills, Hyderabad" },
  { code: "bengaluru", name: "Lavelle Road, Bengaluru" },
  { code: "gurugram", name: "Gurugram" },
  { code: "mumbai_bandra", name: "Bandra, Mumbai" },
  { code: "mumbai_lokhandwala", name: "Lokhandwala, Andheri West, Mumbai" },
];
export const storeFor = (nameOrCode = "") => {
  const wanted = nameOrCode.trim().toLowerCase();
  if (!wanted) return STORES[0];
  return STORES.find((s) => s.code === wanted || s.name.toLowerCase().includes(wanted)) ?? STORES[0];
};

// Search skips the catalogue's articles (priced at zero), repeats, and what WhatsApp's commerce rules keep off the
// platform (alcohol, supplements, infant food). What's in stock comes first; the AI sees six, in the catalogue's order.
// Search ignores case, so "Burrata" and "burrata" share one cached answer.
export async function products(query: string, store: string): Promise<Product[]> {
  const found = await catalogue("$q:String!", "search:$q", { q: query.toLowerCase() }, store);
  const sellable = found.filter((item) => price(item) > 0 && !RESTRICTED.test(item.name));
  return sellable
    .filter((item, i) => sellable.findIndex((other) => other.name.trim() === item.name.trim()) === i)
    .sort((a, b) => Number(inStock(b)) - Number(inStock(a)))
    .slice(0, 6)
    .map((item) => ({
      name: item.name.trim(),
      price_inr: price(item),
      in_stock: inStock(item),
      url: `${SITE}/shop/product/${item.url_key}/`,
      image: photo(item),
    }));
}

export async function basket(phone: string, store: string): Promise<Basket> {
  if (live()) {
    const found = await api<Basket>(`/customers/${phone}/basket?store=${storeFor(store).code}`);
    return found ?? { lines: [], url: CART };
  }
  // ponytail: the demo's basket until the endpoint exists: three real products, priced and stocked live at the store.
  const qtyBySku: Record<string, number> = { "9810": 1, "19838": 2, "3562": 1 };
  const items = await catalogue("$skus:[String]", "filter:{sku:{in:$skus}}", { skus: Object.keys(qtyBySku) }, store);
  return {
    lines: items.map((item) => ({
      name: item.name.trim(),
      qty: qtyBySku[item.sku],
      unit_price_inr: price(item),
      in_stock: inStock(item),
    })),
    url: CART,
  };
}

// Moving a customer to another store takes their basket along, at that store's prices and stock. ponytail: on the
// sample basket nothing is written: the new store's view of it is what moved.
export async function moveBasket(phone: string, from: string, to: string): Promise<Moved> {
  if (live()) {
    const moved = await api<Moved>(`/customers/${phone}/basket/move`, { store: storeFor(to).code });
    return moved ?? { lines: [], missing: [], url: CART };
  }
  const [before, after] = await Promise.all([basket(phone, from), basket(phone, to)]);
  const missing = before.lines
    .filter((line) => !after.lines.some((l) => l.name === line.name))
    .map((line) => line.name);
  return { ...after, missing };
}

// Adding products to their basket at their store, by page (the AI has only the pages FoodStories showed it).
// ponytail: without the endpoint nothing is written and the catalogue's live stock decides. `stress` is the demo's
// stress test: every other line sells out between the search and the add, so one product sells out entirely and of
// two, the first does.
export async function addToBasket(
  phone: string,
  store: string,
  items: { key: string; qty: number }[],
  stress = false,
): Promise<Added> {
  const found = await catalogue(
    "$keys:[String]",
    "filter:{url_key:{in:$keys}}",
    { keys: items.map((wanted) => wanted.key) },
    store,
    true, // stock as it is now, not as Magento cached it
  );
  const lines = items.map((wanted, i) => ({
    ...wanted,
    item: found.find((f) => f.url_key === wanted.key),
    sellsOut: stress && i % 2 === 0,
  }));
  const soldOut = lines.filter((line) => line.item && (line.sellsOut || !inStock(line.item)));
  const addable = lines.filter((line) => line.item && !soldOut.includes(line));
  // Named from its page key, less any trailing number.
  const missing = lines.filter((line) => !line.item).map((line) => line.key.replace(/-\d+$/, "").replace(/-/g, " "));
  const out = soldOut.map((line) => line.item!.name.trim());
  if (live() && addable.length) {
    const res = await api<Omit<Added, "missing">>(`/customers/${phone}/basket/items`, {
      store: storeFor(store).code,
      items: addable.map((line) => ({ sku: line.item!.sku, qty: line.qty })),
    });
    if (!res) throw new Error("FoodStories doesn't know this customer");
    return { added: res.added, out: [...out, ...res.out], missing, url: res.url };
  }
  return {
    added: addable.map((line) => ({ name: line.item!.name.trim(), qty: line.qty, unit_price_inr: price(line.item!) })),
    out,
    missing,
    url: CART,
  };
}

// The closest in-stock products to ones that sold out, for "you just missed it": a search for each of the first two,
// other products only.
export async function inStockInstead(names: string[], store: string, skip: string[] = []): Promise<Product[]> {
  const searches = names.slice(0, 2).map((name) => products(name, store).catch(() => []));
  const found = (await Promise.all(searches)).flat();
  return found
    .filter(
      (product, i) =>
        product.in_stock &&
        !names.includes(product.name) &&
        !skip.includes(product.name) &&
        found.findIndex((other) => other.name === product.name) === i,
    )
    .slice(0, 2);
}

// A tap-time check that names products (`needs.stock` in lib/bot.ts), by page key: what's in stock at the store now,
// and what isn't (sold out, or not sold there), by name. Read past Magento's cache, like an add.
export async function stockAt(keys: string[], store: string) {
  const found = await catalogue("$keys:[String]", "filter:{url_key:{in:$keys}}", { keys }, store, true);
  const item = (key: string) => found.find((f) => f.url_key === key);
  const name = (key: string) => item(key)?.name.trim() ?? key.replace(/-/g, " ");
  const inStockNow = (key: string) => !!item(key) && inStock(item(key)!);
  return { inStock: keys.filter(inStockNow).map(name), out: keys.filter((key) => !inStockNow(key)).map(name) };
}

export const customer = async (phone: string): Promise<Customer | undefined> =>
  live() ? api<Customer>(`/customers/${phone}`) : undefined;

// The site's public catalogue (Magento GraphQL, scoped to the store's view): `variableDefs` declares the query's
// variables, `args` picks the products, 20 at most. A read is a GET, which Magento answers from its cache, keyed by
// store (~0.2 s, against ~0.6 s for a POST); `fresh` posts instead, past the cache.
async function catalogue(
  variableDefs: string,
  args: string,
  variables: Record<string, unknown>,
  store: string,
  fresh = false,
): Promise<Item[]> {
  const query = `query(${variableDefs}){products(${args},pageSize:20){items{__typename sku name url_key stock_status price_range{minimum_price{final_price{value}}} small_image{url}}}}`;
  const scope = { store: storeFor(store).code };
  const signal = AbortSignal.timeout(6000);
  let res: Response;
  if (fresh) {
    const body = JSON.stringify({ query, variables });
    res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { ...scope, "content-type": "application/json" },
      body,
      signal,
    });
  } else {
    const params = new URLSearchParams({ query, variables: JSON.stringify(variables) });
    res = await fetch(`${GRAPHQL}?${params}`, { headers: scope, signal });
  }
  const body = await res.json();
  if (!res.ok || !body.data)
    throw new Error(`catalogue ${res.status}: ${JSON.stringify(body.errors ?? "").slice(0, 120)}`);
  return body.data.products.items;
}

const price = (item: Item) => item.price_range.minimum_price.final_price.value;
const inStock = (item: Item) => item.stock_status === "IN_STOCK";

// A product's photo at its original address: Magento's resized copies (/cache/<hash>/) 403 until the site has shown
// them, and /placeholder/ is its stand-in when a product has none.
const photo = (item: Item) => {
  const url = item.small_image?.url;
  if (!url || /\/placeholder\//.test(url)) return undefined;
  return url.replace(/\/cache\/[0-9a-f]+\//, "/");
};

// FoodStories' own endpoint, FOODSTORIES_API_URL + FOODSTORIES_API_KEY: a Magento integration behind it that reads,
// adds to a basket and moves it between stores. A 404 is nothing found.
async function api<T>(path: string, body?: unknown): Promise<T | undefined> {
  const res = await fetch(process.env.FOODSTORIES_API_URL + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${process.env.FOODSTORIES_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`FoodStories ${res.status}`);
  return res.json() as Promise<T>;
}

// Whether that endpoint is set up; until it is, the basket is a sample.
const live = () => !!process.env.FOODSTORIES_API_URL;
