const ref = require('ssb-ref')
const Testbot = require('scuttle-testbot')
const crypto = require('crypto')

const caps = {
  shs: crypto.randomBytes(32).toString('base64')
}

exports.createTestbot = function (config = {}) {
  const stack = Testbot
    .use(require('ssb-conn'))
    .use(require('ssb-friends'))
    .use(require('../')) // ssb-replicate

  return stack({
    caps,
    db1: true,
    conn: {
      autostart: true,
      ...(config.conn || {})
    },
    ...config
  })
}

exports.follow = function (id) {
  return {
    type: 'contact', contact: id, following: true
  }
}
exports.unfollow = function (id) {
  return {
    type: 'contact', contact: id, following: false
  }
}
exports.block = function unfollow (id) {
  return {
    type: 'contact', contact: id, flagged: true
  }
}

exports.pub = function (address) {
  return {
    type: 'pub',
    address: ref.parseAddress(address)
  }
}

exports.file = function (hash) {
  return {
    type: 'file',
    file: hash
  }
}
