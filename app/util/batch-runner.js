
var Properties = require('./../config/properties')

let maxIterations

var BatchRunner = {
    init(iMaxIterations=Properties.maxIterations) {
        maxIterations = iMaxIterations
    },

    run(runnable, condFunc, prepareNextRun, iteration=1, ...args) {
        iteration++

        runnable(...args).then((result) => {
            if (condFunc(result) && iteration <= maxIterations) {
                let newArgs = prepareNextRun(...args)
                return BatchRunner.run(runnable, condFunc, prepareNextRun, iteration, ...newArgs)
            }

            return Promise.resolve(result)
        })
    }
}

module.exports = BatchRunner