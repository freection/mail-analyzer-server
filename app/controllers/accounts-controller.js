
var AccountsStore = require('./../stores/accounts-store')
var MailService = require('./../services/mail-service')

var AccountsController = {
    fetchAccount(id) {
        return MailService.fetchAccount(id).then((account) => {
            AccountsStore.setAccount(account)
            return account;
        })
    }
}

module.exports = AccountsController