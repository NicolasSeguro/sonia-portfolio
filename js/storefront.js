'use strict';

const SHOPIFY_QUERIES_FRAGMENTS = {
	checkoutContent: `fragment checkoutContent on Checkout {
		id
		createdAt
		updatedAt
		completedAt
		note
		webUrl
		customAttributes {
			key
			value
		}
		totalTax {
			amount
			currencyCode
		}
		totalPrice {
			amount
			currencyCode
		}
		totalDuties {
			amount
			currencyCode
		}
		taxesIncluded
		taxExempt
		subtotalPrice {
			amount
			currencyCode
		}
		lineItemsSubtotalPrice {
			amount
			currencyCode
		}
		requiresShipping

		lineItems(first: 200) {
			edges {
				node {
					customAttributes {
						key
						value
					}
					id
					quantity
					title
					unitPrice {
						amount
						currencyCode
					}
					variant {
						id
						sku
						title
						weight
						weightUnit
						product {
							id
							title
							handle
							productType
						}
						selectedOptions {
							name
							value
						}
						availableForSale
						barcode
						price {
							amount
							currencyCode
						}
						unitPrice {
							amount
							currencyCode
						}
					}
				}
			}
		}
	}`
};

const SHOPIFY_QUERIES = {

	checkoutCreate: `mutation checkoutCreate($input: CheckoutCreateInput!) {
		checkoutCreate(input: $input) {
			checkout {
				id
				webUrl
			}
		}
	}`,

	checkoutFetch: `query checkoutFetch($id: ID!) {
		node(id: $id) {
			...checkoutContent
		}
	}
	${SHOPIFY_QUERIES_FRAGMENTS.checkoutContent}`,

	checkoutLineItemsAdd: `mutation checkoutLineItemsAdd($id: ID!, $lineItems: [CheckoutLineItemInput!]!) {
		checkoutLineItemsAdd(checkoutId: $id, lineItems: $lineItems) {
			checkout {
				...checkoutContent
			}
			checkoutUserErrors {
				code
				field
				message
			}
		}
	}
	${SHOPIFY_QUERIES_FRAGMENTS.checkoutContent}`,

	checkoutLineItemsUpdate: `mutation checkoutLineItemsUpdate($id: ID!, $lineItems: [CheckoutLineItemUpdateInput!]!) {
		checkoutLineItemsUpdate(checkoutId: $id, lineItems: $lineItems) {
			checkout {
				...checkoutContent
			}
			checkoutUserErrors {
				code
				field
				message
			}
		}
	}
	${SHOPIFY_QUERIES_FRAGMENTS.checkoutContent}`,

	checkoutLineItemsRemove: `mutation checkoutLineItemsRemove($id: ID!, $lineItemIds: [ID!]!) {
		checkoutLineItemsRemove(checkoutId: $id, lineItemIds: $lineItemIds) {
			checkout {
				...checkoutContent
			}
			checkoutUserErrors {
				code
				field
				message
			}
		}
	}
	${SHOPIFY_QUERIES_FRAGMENTS.checkoutContent}`,

	checkoutAttributesUpdateV2: `mutation checkoutAttributesUpdateV2($id: ID!, $input: CheckoutAttributesUpdateV2Input!) {
		checkoutAttributesUpdateV2(checkoutId: $id, input: $input) {
			checkout {
				id
			}
			checkoutUserErrors {
				code
				field
				message
			}
		}
	}`,

};

async function shopifyStorefrontQuery(query, variables) {
	const res = await fetch(`https://${SHOPIFY_API_DOMAIN}/api/2023-01/graphql.json`, {
		method: 'POST',
		body: JSON.stringify({query, variables}),
		headers: {
			'Content-Type': 'application/json',
			'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
		}
	});
	return await res.json();
}

const CHECKOUT_COOKIE = 'checkout';

async function checkoutCreate() {
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutCreate, {input: {}});
	setCookie(CHECKOUT_COOKIE, res.data.checkoutCreate.checkout.id, 14);
	return res.data.checkoutCreate.checkout.id;
}

async function checkoutFetch() {
	let id = getCookie(CHECKOUT_COOKIE);
	if(!id || id.length == 0) {
		return null;
	}
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutFetch, {id: id});
	if(!res.data.node || res.data.node.completedAt) {
		id = await checkoutCreate();
		return await checkoutFetch();
	}
	return res.data.node;
}

async function checkoutAdd(items) {
	let id = getCookie(CHECKOUT_COOKIE);
	if(!id || id.length == 0) {
		id = await checkoutCreate();
	}
	const revisedItems = items.map((item) => {
		const modifiedAttrs = [];
		for(const key in item.attributes) {
			modifiedAttrs.push({
				key,
				value: item.attributes[key],
			});
		}

		return {
			variantId: item.variantId,
			quantity: item.quantity,
			customAttributes: modifiedAttrs,
		};
	});
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutLineItemsAdd, {id: id, lineItems: revisedItems});
	if(res.data.checkoutLineItemsAdd.checkoutUserErrors.length) {
		throw new Error(res.data.checkoutLineItemsAdd.checkoutUserErrors);
	}
	return res.data.checkoutLineItemsAdd.checkout;
}

async function checkoutUpdate(lineItems) { // array of {id: 'LineItemID', quantity: int, customAttributes: []}
	const id = (await checkoutFetch()).id;
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutLineItemsUpdate, {id: id, lineItems: lineItems});
	if(res.data.checkoutLineItemsUpdate.checkoutUserErrors.length) {
		throw new Error(res.data.checkoutLineItemsUpdate.checkoutUserErrors);
	}
	return res.data.checkoutLineItemsUpdate.checkout;
}


async function checkoutRemove(lineIDs) {
	const id = (await checkoutFetch()).id;
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutLineItemsRemove, {id: id, lineItemIds: lineIDs});
	if(res.data.checkoutLineItemsRemove.checkoutUserErrors.length) {
		throw new Error(res.data.checkoutLineItemsRemove.checkoutUserErrors);
	}
	return res.data.checkoutLineItemsRemove.checkout;
}

async function checkoutUpdateNote(note) {
	const id = (await checkoutFetch()).id;
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutAttributesUpdateV2, {id: id, input: {
		note: note,
	}});
	if(res.data.checkoutAttributesUpdateV2.checkoutUserErrors.length) {
		throw new Error(res.data.checkoutAttributesUpdateV2.checkoutUserErrors);
	}
}

// attributes should be an object, translation into {key: "key", value: "value"} is performed here.
async function checkoutUpdateCustomAttributes(attributes) {
	const id = (await checkoutFetch()).id;
	const res = await shopifyStorefrontQuery(SHOPIFY_QUERIES.checkoutAttributesUpdateV2, {id: id, input: {
		customAttributes: Object.keys(attributes).map(function(key) {
			return {
				key: key,
				value: attributes[key],
			};
		})
	}});
	if(res.data.checkoutAttributesUpdateV2.checkoutUserErrors.length) {
		throw new Error(res.data.checkoutAttributesUpdateV2.checkoutUserErrors);
	}
}