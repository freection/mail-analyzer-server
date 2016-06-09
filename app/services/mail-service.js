
var ContextIO = require('contextio');

var Properties = require('./../config/properties')

let cioClient;

var MailService = {
    init() {
        cioClient = ContextIO({
            key: Properties.context.key,
            secret: Properties.context.secret,
            version: '2.0'
        })
    },

    fetchAccount(accountId) {
        return cioClient.accounts(accountId).get()
    },

    fetchMessages(accountId, startIndex, numOfItems=100, startDate, endDate) {
        return cioClient.accounts(accountId).messages().get({
            offset: startIndex,
            limit: numOfItems,
            date_after: startDate ? startDate.getTime() / 1000 : undefined,
            date_before: endDate ? endDate.getTime() / 1000 : undefined
        })
    }
}

module.exports = MailService