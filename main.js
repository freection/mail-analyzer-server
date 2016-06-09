
var express = require('express')

var Properties = require('./app/config/properties')
var Router = require('./app/config/router')
var ThreadsController = require('./app/controllers/threads-controller')
var MailService = require('./app/services/mail-service')
var BatchRunner = require('./app/util/batch-runner')

let app = express();

var Main = {
    init() {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        return Main.initProps().then(() => {
            Router.init(app)
            MailService.init()
            BatchRunner.init()
        })
    },

    initProps() {
        Properties.init()
        return Properties.loadProperties()
    },

    launch() {
        app.listen(3000, () => {
            console.log('Example app listening on port 3000.')
            ThreadsController.loadAccountThreads('5708ecd4ca2712cc3f8b4569')
        })
    }
}

Main.init().then(Main.launch)

