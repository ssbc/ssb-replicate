'use strict'
const Legacy = require('./legacy')
const Notify = require('pull-notify')

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: require('./manifest.json'),
  init: function (ssbServer, config) {
    const notify = Notify()
    if (!config.replicate || config.replicate.legacy !== false) {
      const replicate = Legacy.call(this, ssbServer, notify, config)

      // replication policy is set by calling
      // ssbServer.replicate.request(id)
      // or by cancelling replication
      // ssbServer.replicate.request(id, false)
      // this is currently performed from the ssb-friends plugin

      return replicate
    } else {
      return {
        request () {},
        block (from, to, blocking) {},
        changes () {
          return function (abort, cb) { cb(true) } // eslint-disable-line
        },
        help () {
          return require('./help')
        }
      }
    }
  }
}
