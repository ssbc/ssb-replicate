'use strict'
var path = require('path')
var Legacy = require('./legacy')
var fs = require('fs')
var Notify = require('pull-notify')

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: require('./manifest.json'),
  init: function (ssbServer, config) {
    var notify = Notify()
    if(!config.replicate || config.replicate.legacy !== false) {
      var replicate = Legacy.call(this, ssbServer, notify, config)

      // replication policy is set by calling
      // ssbServer.replicate.request(id)
      // or by cancelling replication
      // ssbServer.replicate.request(id, false)
      // this is currently performed from the ssb-friends plugin

      return replicate
    }
    else
      return {
        request: function () {},
        block: function (from, to, blocking) {},
        changes: function () { return function (abort, cb) { cb(true) } },
        help: function () {
          return require('./help')
        }
      }
  }
}


