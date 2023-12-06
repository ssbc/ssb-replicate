const cont = require('cont')
const tape = require('tape')
const pull = require('pull-stream')
const u = require('./util')

tape('replicate between 3 peers (realtime)', function (t) {
  const bob = u.createTestbot({
    name: 'realtime-bob'
    //      port: 45452, host: 'localhost',
    //      replicate: {legacy: false},
  })

  const alice = u.createTestbot({
    name: 'realtime-alice',
    //    port: 45453, host: 'localhost',
    seeds: [bob.getAddress()] // << mix: what was this?
    //      replicate: {legacy: false},
  })

  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id))
  ])(function (err) {
    if (err) throw err

    alice.connect(bob.getAddress(), function (err, _rpc) {
      t.error(err)
    })

    const ary = []
    pull(
      bob.createHistoryStream({ id: alice.id, seq: 0, keys: false, live: true }),
      pull.drain(function (data) {
        // console.log(data)
        ary.push(data)
      })
    )
    let l = 12
    setTimeout(function next () {
      if (!--l) {
        pull(
          bob.createHistoryStream({ id: alice.id, sequence: 0, keys: false }),
          pull.collect(function (err, _ary) {
            t.error(err)
            t.equal(_ary.length, 12)
            t.deepEqual(ary, _ary)
            bob.close(true); alice.close(true); t.end()
          })
        )
      } else {
        alice.publish({ type: 'test', value: new Date() },
          function (err, msg) {
            if (err) throw err
            // console.log('added', msg.key, msg.value.sequence)
            setTimeout(next, 200)
          })
      }
    }, 200)
  })
})
