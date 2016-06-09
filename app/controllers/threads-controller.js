
var _ = require('lodash')
var EmailAddressParser = require('email-addresses');

var Properties = require('./../config/properties')
var BatchRunner = require('./../util/batch-runner')
var MailService = require('./../services/mail-service')
var AccountsController = require('./accounts-controller')
var AccountsStore = require('./../stores/accounts-store')

var ThreadsController = {
    loadAccountThreads(accountId) {
        return AccountsController.fetchAccount(accountId).then((account) => {
            BatchRunner.run(
                ThreadsController.fetchThreads,
                () => {
                    return account.numOfParsedMessages < account.totalNumOfMessages
                },
                (account) => {
                    return [account, account.numOfParsedMessages, 100]
                },
                1, account, 0, 100)
        })
    },

    fetchThreads(account, startIndex, numOfItems) {
        return MailService.fetchMessages(account.id, startIndex, numOfItems).then((messages) => {
            return ThreadsController.parseThreads(account, messages)
        })
    },

    parseThreads(account, messages) {
        var threads = _.groupBy(messages, 'gmail_thread_id');

        let singleRecipientThreads = filterSingleRecipient(account, threads);
        let multiRecipientsThreads = filterMultiOrgRecipient(account, threads);
        let githubDiscussions = filterGithubDiscussions(account, threads);

        _.forOwn(singleRecipientThreads, function(threadMessages) {
            threadMessages = _.sortBy(threadMessages, 'date');

            if (threadMessages && threadMessages.length) {
                account.questions.push({
                    subject: threadMessages[0].subject,
                    asker: threadMessages[0].addresses.from.email,
                    answerer: threadMessages[0].addresses.to && threadMessages[0].addresses.to.length ?
                        threadMessages[0].addresses.to[0].email : '',
                    stats: calcStatsForSingleThread(threadMessages)
                });
            }
        });

        _.forOwn(multiRecipientsThreads, function(threadMessages) {
            if (threadMessages && threadMessages.length) {
                account.discussions.push({
                    subject: threadMessages[0].subject,
                    recipients: _.filter(_.keys(threadMessages[0].person_info), function (address) {
                        return address !== account.emailAddress
                    }),
                    stats: calcStatsForSingleThread(threadMessages)
                });
            }
        });

        _.forOwn(githubDiscussions, function(threadMessages) {
            if (threadMessages && threadMessages.length) {
                account.discussions.push({
                    subject: threadMessages[0].subject,
                    recipients: _.filter(_.keys(threadMessages[0].person_info), function (address) {
                        return address !== account.emailAddress
                    })
                });
            }
        });

        console.log('Account [%s] - found %s questions and %s discussions',
            account.emailAddress, account.questions.length, account.discussions.length)

        account.numOfParsedMessages += messages.length;

        return Promise.resolve(messages);
    },

    getQuestions(accountId, fromIndex, toIndex) {
        let account = AccountsStore.getAccount(accountId)
        var questions = account ? account.questions : []
        return Promise.resolve(questions.slice(fromIndex, toIndex))
    },

    getDiscussions(accountId, fromIndex, toIndex) {
        let account = AccountsStore.getAccount(accountId)
        var discussions = account ? account.discussions : []
        return Promise.resolve(discussions.slice(fromIndex, toIndex))
    }
}

function filterSingleRecipient(account, threads) {
    return _.pickBy(threads, function(messages) {
        return isThreadSingleRecipient(account, messages);
    });
}

function filterMultiOrgRecipient(account, threads) {
    return _.pickBy(threads, function(messages) {
        return isThreadMultiOrgRecipients(account, messages);
    });
}

function filterGithubDiscussions(account, threads) {
    return _.pickBy(threads, function(messages) {
        var firstMessage = messages[messages.length - 1];
        return isGithub(firstMessage) &&
            (_.some(firstMessage.addresses.to, function(address) {
                return address.email === account.emailAddress;
            }) ||
            _.some(firstMessage.addresses.cc, function(address) {
                return address.email === account.emailAddress;
            }));
    })
}

function calcStatsForThreads(threads) {
    return {
        average: _.sum(_.map(threads, 'stats.average')) / threads.length,
        max: _.max(_.map(threads, 'stats.max')),
        min: _.min(_.map(threads, 'stats.min'))
    };
}

function calcStatsForSingleThread(messages) {
    var responseTimes = [];

    _.forEach(messages, function(message, index) {
        if (index === messages.length - 1) {
            return;
        }

        var nextMessage = messages[index + 1];
        if (nextMessage) {
            responseTimes.push(nextMessage.date - message.date);
        }
    });

    return {
        average: _.sum(responseTimes) / responseTimes.length,
        max: _.max(responseTimes),
        min: _.min(responseTimes)
    };
}

function isThreadSingleRecipient(account, messages) {
    return messages.length >= 2 && _.some(messages, (message) => {
        return isMessageSingleRecipient(account, message)
    });
}

function isThreadMultiOrgRecipients(account, messages) {
    return messages.length >= 2 && _.some(messages, (message) => {
        return isMessageMultiOrgRecipient(account, message)
    });
}

function isMessageSingleRecipient(account, message) {
    return message.person_info &&
        _.keys(message.person_info).length === 2 &&
        _.some(_.keys(message.person_info), function(address) {
            return address === account.emailAddress;
        }) &&
        _.every(_.keys(message.person_info), function(address) {
            return address.indexOf(account.domain) >= 0 && !isGroupMail(address);
        }) &&
        !fromBot(message) &&
        !isInvitation(message);
}

function isMessageMultiOrgRecipient(account, message) {
    return message.person_info &&
        _.keys(message.person_info).length > 2 &&
        _.some(_.keys(message.person_info), function(address) {
            return address === account.emailAddress;
        }) &&
        _.every(_.keys(message.person_info), function(address) {
            return address.indexOf(account.domain) >= 0 && !isGroupMail(address);
        }) &&
        !fromBot(message) &&
        !isInvitation(message);
}

function fromBot(message) {
    return isJenkins(message) || isCrucible(message) || isGithub(message);
}

function isGroupMail(address) {
    return EmailAddressParser.parseOneAddress(address).local.indexOf('\.') < 0;
}

function isInvitation(message) {
    return message.files && message.files.length && _.some(message.files, {'file_name': 'invite.ics'})
}

function isJenkins(message) {
    return message.email_message_id.indexOf('jenkins') >= 0;
}

function isCrucible(message) {
    return message.email_message_id.indexOf('crucible') >= 0 ||
        message.subject.match(/^\[.*crucible.*\].*$/i);
}

function isGithub(message) {
    return message.addresses.from.email === 'notifications@github.com';
}


module.exports = ThreadsController