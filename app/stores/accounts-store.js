
var EmailAddressParser = require('email-addresses');

let accounts = {}

var AccountsStore = {
    setAccount(account) {
        if (account.email_addresses && account.email_addresses.length) {
            account.emailAddress = account.email_addresses[0];
            account.domain = EmailAddressParser.parseOneAddress(account.emailAddress).domain;
            account.totalNumOfMessages = account['nb_messages']

            if (!AccountsStore.hasAccount(account.id)) {
                account.questions = []
                account.discussions = []
                account.numOfParsedMessages = 0
            }
        }

        accounts[account.id] = account
    },

    getAccount(id) {
        return accounts[id]
    },

    hasAccount(id) {
        return !!AccountsStore.getAccount(id)
    }
}

module.exports = AccountsStore