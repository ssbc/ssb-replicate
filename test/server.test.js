const cont = require('cont')
const deepEqual = require('deep-equal')
const tape = require('tape')

const u = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

tape('replicate between 3 peers (server)', function (t) {
  const alice = u.createTestbot({
    name: 'server-alice',
    port: 45451,
    timeout: 1400
  })
  const bob = u.createTestbot({
    name: 'server-bob',
    port: 45452,
    timeout: 1400
  })
  const carol = u.createTestbot({
    name: 'server-carol',
    port: 45453,
    timeout: 1400
  })

  const apub = cont(alice.publish)
  const bpub = cont(bob.publish)
  const cpub = cont(carol.publish)

  cont.para([
    // NOTE each peer registers ANOTHER peer as a pub, to trigger
    // auto-connections using ssb-conn
    apub(u.pub(bob.getAddress())),
    bpub(u.pub(carol.getAddress())),
    cpub(u.pub(alice.getAddress())),

    apub(u.follow(bob.id)),
    apub(u.follow(carol.id)),

    bpub(u.follow(alice.id)),
    bpub(u.follow(carol.id)),

    cpub(u.follow(alice.id)),
    cpub(u.follow(bob.id))
  ])(function (err, ary) {
    t.error(err, 'publish pub, follow')

    const expected = {}
    expected[alice.id] = expected[bob.id] = expected[carol.id] = 3

    function check (server, name) {
      let closed = false
      return server.on('replicate:finish', function (actual) {
        // console.log(actual)
        if (deepEqual(expected, actual) && !closed) {
          closed = true
          done()
        }
      })
    }

    check(alice, 'ALICE')
    check(bob, 'BOB')
    check(carol, 'CAROL')

    let n = 2

    function done () {
      if (--n) return
      alice.close(true); bob.close(true); carol.close(true)
      t.ok(true)
      t.end()
    }
  })
})
