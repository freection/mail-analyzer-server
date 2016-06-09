
var ThreadsController = require('./../controllers/threads-controller')

var Router = {
    init(app) {
        app.get('/api/accounts/:accountId/questions', (req, res) => {
            var accountId = req.params.accountId
            var fromIndex = req.query.fromIndex || 0
            var toIndex = req.query.toIndex || 100

            ThreadsController.getQuestions(accountId, fromIndex, toIndex).then((questions) => {
                res.json(questions)
            }).catch((error) => {
                res.send(error.status, error.message)
            })
        })

        app.get('/api/accounts/:accountId/discussions', (req, res) => {
            var accountId = req.params.accountId
            var fromIndex = req.query.fromIndex || 0
            var toIndex = req.query.toIndex || 100

            ThreadsController.getDiscussions(accountId, fromIndex, toIndex).then((discussions) => {
                res.json(discussions)
            }).catch((error) => {
                res.send(error.status, error.message)
            })
        })
    }
}

module.exports = Router