const ref = require('ssb-ref')
const scuttleTestbot = require('scuttle-testbot')
const crypto = require('crypto')

const caps = {
  shs: crypto.randomBytes(32).toString('base64')
}
exports.testbot = function testbot (config) {
  const stack = scuttleTestbot
    .use(require('..'))
    .use(require('ssb-friends'))

  if (config.gossip) {
    stack.use(require('ssb-gossip'))
  }

  return stack({
    caps,
    db1: true,
    timeout: 1000,
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
