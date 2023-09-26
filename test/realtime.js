const cont = require('cont')
const tape = require('tape')
const pull = require('pull-stream')
const u = require('./util')

const ssbKeys = require('ssb-keys')

const createSsbServer = u.testbot

tape('replicate between 3 peers', function (t) {
  const bob = createSsbServer({
    name: 'test-bob',
    //      port: 45452, host: 'localhost',
    //      replicate: {legacy: false},
    keys: ssbKeys.generate()
  })

  const alice = createSsbServer({
    name: 'test-alice',
    //    port: 45453, host: 'localhost',
    seeds: [bob.getAddress()],
    //      replicate: {legacy: false},
    keys: ssbKeys.generate()
  })

  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id))
  ])(function (err) {
    if (err) throw err

    alice.connect(bob.getAddress(), function (err, _rpc) {
      if (err) throw err
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
        const _ary = []
        pull(
          bob.createHistoryStream({ id: alice.id, sequence: 0, keys: false }),
          pull.collect(function (err, gary) {
            if (err) throw err
            t.equal(_ary.length, 12)
            t.deepEqual(ary, _ary)
            bob.close(true); alice.close(true); t.end()
          })
        )
      } else {
        alice.publish({ type: 'test', value: new Date() },
          function (err, msg) {
            if (err) throw err
            console.log('added', msg.key, msg.value.sequence)
            setTimeout(next, 200)
          })
      }
    }, 200)
  })
})
