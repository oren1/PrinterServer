/**
 * Simple Item shape derived from WooCommerce `line_items`.
 * @typedef {Object} Item
 * @property {string} name
 * @property {number} quantity
 * @property {string} total
 */

/**
 * Simple Order shape used in the UI layer.
 * @typedef {Object} Order
 * @property {string} orderNumber
 * @property {string} status
 * @property {string} recipientName
 * @property {string} dateCreated
 * @property {string} shippingTotal
 * @property {string} total
 * @property {string} billingAddress1
 * @property {string} billingCity
 * @property {string} billingEmail
 * @property {string} billingPhone
 * @property {string} apartmentNumber
 * @property {string} streetNumber
 * @property {Item[]} items
 */

