var express = require('express');
var app = express();

var fs = require('fs');
var _ = require('lodash');
var Promise = require('promise');
var datejs = require('datejs');

var ContextIO = require('contextio');
var EmailAddressParser = require('email-addresses');
var watson = require('watson-developer-cloud');
var GoogleContacts = require('google-contacts').GoogleContacts;

var TASK_REGEX = /.*task.*/;
var MAX_ITERATIONS = 30;

var alchemy, cioClient, googleContacts;
var threadStore;
var totalMessages, account, contacts, startDate, endDate;
var debugStart, debugEnd;

function init() {
    initDates();

    threadStore = {
        numOfThreads: 0,
        questions: [],
        discussions: []
    };

    googleContacts = new GoogleContacts({
        token: ''
    });

    cioClient = ContextIO({
    });

    return cioClient.accounts('5708ecd4ca2712cc3f8b4569').get().then(
        function(result) {
            account = result;
            totalMessages = account['nb_messages'];
            account.emailAddress = account.email_addresses[0];
            account.domain = EmailAddressParser.parseOneAddress(account.emailAddress).domain;
        }
    ).then(initContacts);
}

function initDates() {
    startDate = Date.today().set({day: 1, month: 0, year: 2016});
    // endDate = Date.today().set({day: 1, month: 0, year: 2015});
}

function initContacts() {
    // contacts = {};
    // return cioClient.accounts(account.id).contacts().get().then(
    //     function(result) {
    //         return Promise.all(_.map(result.matches, function(contact) {
    //             return cioClient.accounts(account.id).contacts(contact.email).get().then(
    //                 function(singleContact) {
    //                     contacts[contact.email] = singleContact;
    //                 }
    //             )
    //         }));
    //     }
    // );
}

function fetchThreads() {
    var iteration = 0;

    function fetch(offset) {
        console.log('Fetching offset:', offset);

        iteration++;

        var params = {
            offset: offset,
            limit: 100,
            date_after: startDate ? startDate.getTime() / 1000 : undefined,
            date_before: endDate ? endDate.getTime() / 1000 : undefined
        };

        return cioClient.
            accounts(account.id).
            messages().
            get(params).then(parseThreads).then(
                function(results) {
                    console.log('# of results:', results.length);

                    if (threadStore.numOfThreads < totalMessages && iteration < MAX_ITERATIONS) {
                        return fetch(threadStore.numOfThreads + 100);
                    }

                    console.log('Total number of messages:', threadStore.numOfThreads);
                    return Promise.resolve();
                }
            );
    }

    return fetch(0);
}

function parseThreads(messages) {
    console.log('First message from %s', new Date(messages[messages.length - 1].date * 1000).toDateString());

    var threads = _.groupBy(messages, 'gmail_thread_id');
    var numOfThreads = _.keys(threads).length;

    var singleRecipientThreads = filterSingleRecipient(threads);
    var multiRecipientsThreads = filterMultiOrgRecipient(threads);
    var githubDiscussions = filterGithubDiscussions(threads);

    _.forOwn(singleRecipientThreads, function(threadMessages) {
        threadMessages = _.sortBy(threadMessages, 'date');

        if (threadMessages && threadMessages.length) {
            threadStore.questions.push({
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
            threadStore.discussions.push({
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
            threadStore.discussions.push({
                subject: threadMessages[0].subject,
                recipients: _.filter(_.keys(threadMessages[0].person_info), function (address) {
                    return address !== account.emailAddress
                })
            });
        }
    });

    console.log('');
    console.log('We have %s questions out of %s threads (%s %):', threadStore.questions.length, numOfThreads,
        ((threadStore.questions.length / numOfThreads) * 100));
    console.log('');

    _.forEach(threadStore.questions, function(question) {
       console.log('Question: "%s" - "%s" asking "%s"', question.subject, question.asker, question.answerer);
    });

    console.log('');
    console.log('We have %s discussions out of %s threads (%s %):', threadStore.discussions.length, numOfThreads,
        ((threadStore.discussions.length / numOfThreads) * 100));
    console.log('');

    _.forEach(threadStore.discussions, function(discussion) {
        console.log('Discussion: "%s" - between [%s]', discussion.subject, discussion.recipients.toString());
    });

    threadStore.numOfThreads += messages.length;

    return Promise.resolve(messages);
}

function filterSingleRecipient(threads) {
    return _.pickBy(threads, function(messages) {
        return isThreadSingleRecipient(messages);
    });
}

function filterMultiOrgRecipient(threads) {
    return _.pickBy(threads, function(messages) {
        return isThreadMultiOrgRecipients(messages);
    });
}

function filterGithubDiscussions(threads) {
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

function isThreadSingleRecipient(messages) {
    return messages.length >= 2 && _.some(messages, isMessageSingleRecipient);
}

function isThreadMultiOrgRecipients(messages) {
    return messages.length >= 2 && _.some(messages, isMessageMultiOrgRecipient);
}

function isMessageSingleRecipient(message) {
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

function isMessageMultiOrgRecipient(message) {
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

function start() {
    console.log('Starting fetch:', ((new Date().getTime() - debugStart) / 1000));
    return fetchThreads().catch(error);
}

function error(err) {
    console.log('Error:', err);
}

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    debugStart = new Date().getTime();

    init().then(
        function() {
            console.log('init done');
        }
    ).then(start);
});

app.get('/api/questions', function (req, res) {
    console.log('GET /api/questions');

    var fromIndex = req.query.fromIndex || 0;
    var toIndex = req.query.toIndex || 100;

    res.json(threadStore.questions.slice(fromIndex, toIndex));
});

app.get('/api/discussions', function (req, res) {
    console.log('GET /api/discussions');

    var fromIndex = req.query.fromIndex || 0;
    var toIndex = req.query.toIndex || 100;

    res.json(threadStore.discussions.slice(fromIndex, toIndex));
});

