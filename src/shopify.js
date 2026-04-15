// Shopify API module
require("dotenv").config();

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-04";
const BASE_URL = `https://${SHOP}/admin/api/${API_VERSION}`;

const headers = {
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": TOKEN,
};

async function searchProducts(query) {
  try {
    const graphqlUrl = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
    const gqlQuery = `
      query searchProducts($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title
              descriptionHtml
              productType
              tags
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gqlQuery, variables: { query } }),
    });

    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (data.errors) {
      throw new Error(data.errors.map((e) => e.message).join(", "));
    }

    return data.data.products.edges.map(({ node: p }) => ({
      id: p.id.replace("gid://shopify/Product/", ""),
      title: p.title,
      description: p.descriptionHtml,
      product_type: p.productType,
      tags: p.tags,
      variants: p.variants.edges.map(({ node: v }) => ({
        id: v.id.replace("gid://shopify/ProductVariant/", ""),
        title: v.title,
        price: v.price,
        inventory_quantity: v.inventoryQuantity,
        available: v.inventoryQuantity > 0,
      })),
    }));
  } catch (error) {
    console.error("searchProducts error:", error.message);
    throw error;
  }
}

async function getProductById(productId) {
  try {
    const url = `${BASE_URL}/products/${productId}.json`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const p = data.product;

    return {
      id: p.id,
      title: p.title,
      description: p.body_html,
      product_type: p.product_type,
      tags: p.tags,
      variants: p.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        inventory_quantity: v.inventory_quantity,
        available: v.inventory_quantity > 0,
      })),
    };
  } catch (error) {
    console.error("getProductById error:", error.message);
    throw error;
  }
}

function createCheckoutUrl(items) {
  const cartParams = items
    .map((item) => `${item.variant_id}:${item.quantity}`)
    .join(",");
  return `https://${SHOP}/cart/${cartParams}`;
}

module.exports = {
  searchProducts,
  getProductById,
  createCheckoutUrl,
};
