const cont = require('cont')
const deepEqual = require('deep-equal')
const tape = require('tape')
const ssbKeys = require('ssb-keys')

const u = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

const createSsbServer = (config) => u.testbot({
  ...config,
  gossip: true
})

tape('replicate between 3 peers', function (t) {
  let alice, bob, carol
  const dbA = createSsbServer({
    name: 'server-alice',
    port: 45451,
    timeout: 1400,
    keys: alice = ssbKeys.generate()
  })
  const dbB = createSsbServer({
    name: 'server-bob',
    port: 45452,
    timeout: 1400,
    keys: bob = ssbKeys.generate(),
    seeds: [dbA.getAddress()]
  })
  const dbC = createSsbServer({
    name: 'server-carol',
    port: 45453,
    timeout: 1400,
    keys: carol = ssbKeys.generate(),
    seeds: [dbA.getAddress()]
  })

  const apub = cont(dbA.publish)
  const bpub = cont(dbB.publish)
  const cpub = cont(dbC.publish)

  cont.para([
    apub(u.pub(dbA.getAddress())),
    bpub(u.pub(dbB.getAddress())),
    cpub(u.pub(dbC.getAddress())),

    apub(u.follow(bob.id)),
    apub(u.follow(carol.id)),

    bpub(u.follow(alice.id)),
    bpub(u.follow(carol.id)),

    cpub(u.follow(alice.id)),
    cpub(u.follow(bob.id))
  ])(function (err, ary) {
    if (err) throw err

    const expected = {}
    expected[alice.id] = expected[bob.id] = expected[carol.id] = 3

    function check (server, name) {
      let closed = false
      return server.on('replicate:finish', function (actual) {
        console.log(actual)
        if (deepEqual(expected, actual) && !closed) {
          closed = true
          done()
        }
      })
    }

    check(dbA, 'ALICE')
    check(dbB, 'BOB')
    check(dbC, 'CAROL')

    let n = 2

    function done () {
      if (--n) return
      dbA.close(true); dbB.close(true); dbC.close(true)
      t.ok(true)
      t.end()
    }
  })
})
