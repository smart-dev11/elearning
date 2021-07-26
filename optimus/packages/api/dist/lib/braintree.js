"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refund = void 0;
const braintree_1 = require("braintree");
const config = require("config");
const gateway = new braintree_1.BraintreeGateway({
    environment: braintree_1.Environment[config.get('braintree.environment')],
    merchantId: config.get('braintree.merchantId'),
    publicKey: config.get('braintree.publicKey'),
    privateKey: config.get('braintree.privateKey')
});
const errorMessages = {
    authenticationError: 'Cannot Authenticate with payment processor',
    authorizationError: 'Cannot Authenticate with payment processor',
    downForMaintenanceError: 'Payment processor is down for maintenance, please try again later',
    invalidSignatureError: 'Cannot Authenticate with payment processor',
    invalidChallengeError: 'Cannot Authenticate with payment processor',
    invalidTransparentRedirectHashError: 'Cannot Authenticate with payment processor',
    notFoundError: 'Transaction cannot be found',
    serverError: 'Server Error',
    testOperationPerformedInProductionError: 'Payment processor: Test operation performed in production',
    tooManyRequestsError: 'Payment processor: Too many requests sent'
};
async function refund(transactionId, fLogger, amount) {
    let result;
    try {
        result = await gateway.transaction.refund(transactionId, amount);
    }
    catch (e) {
        const message = errorMessages[e.type.toString()] || e.message;
        fLogger.info({ transactionId, message, payload: e }, 'refund failed');
        throw new Error(message);
    }
    if (result.success && result.transaction) {
        return result.transaction;
    }
    fLogger.warn({ transactionId, payload: result }, 'refund failed');
    const errMessage = (result.transaction && result.transaction.processorSettlementResponseText) ||
        result.message;
    throw new Error(errMessage);
}
exports.refund = refund;
