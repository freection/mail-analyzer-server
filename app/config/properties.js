
var properties = require("properties")
var _ = require("lodash")

const configsDirPath = {
    Windows: "C:\\Users\\Default\\.freection",
    Linux: "~/.freection"
}

var options = null
var propertiesFilePath = null

class Properties {
    constructor() {
    }

    static init() {
        options = {
            path: true,
            namespaces: true,
            sections: true,
            variables: true,
            include: true
        }

        propertiesFilePath = Properties.getPropertiesFile()
    }

    static loadProperties() {
        return new Promise((resolve) => {
            properties.parse(propertiesFilePath, options, (error, result) => {
                _.assign(Properties, result)
                resolve(result)
            })
        })
    }

    static getConfigDirPath() {
        var defaultDirPath = process.env.OS.indexOf("Windows") !== -1 ?
            configsDirPath["Windows"] :
            configsDirPath["Linux"]
        return process.env.FREECTION_HOME || defaultDirPath
    }

    static getPropertiesFile() {
        // NODE_ENV can be "production" or "development".
        // Load specific configuration depending on the environment.
        return Properties.getConfigDirPath() +
            "/mail-analyzer." +
            (process.env.NODE_ENV || "production") +
            ".properties"
    }
}

module.exports = Properties
