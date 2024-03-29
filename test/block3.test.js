const cont = require('cont')
const tape = require('tape')
const u = require('./util')

// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.

const alice = u.createTestbot({
  name: 'block3-alice',
  timeout: 1000
})

const bob = u.createTestbot({
  name: 'block3-bob',
  timeout: 1000
})

const carol = u.createTestbot({
  name: 'block3-carol',
  timeout: 1000
})

tape('alice blocks bob while he is connected, she should disconnect him', function (t) {
  // in the beginning alice and bob follow each other
  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id)),
    cont(carol.publish)(u.follow(alice.id))
  ])(function (err) {
    if (err) throw err

    bob.connect(carol.getAddress(), function (err, rpc) {
      if (err) throw err
    })

    carol.connect(alice.getAddress(), function (err, rpc) {
      if (err) throw err
    })

    bob.on('replicate:finish', function (vclock) {
      // I don't care which messages bob doesn't have of alice's
      t.ok(vclock[alice.id] < 2 || vclock[alice.id] == null, 'bob does not receive the message where alice blocked him')
      alice.close(); bob.close(); carol.close()
      t.end()
    })

    let once = false
    bob.post(function (op) {
      // console.log('BOB RECV', op, bob.id)
      if (once) throw new Error('should only be called once')
      once = true
      // should be the alice's follow(bob) message.

      t.equal(op.value.author, alice.id)
      t.equal(op.value.content.contact, bob.id)
      cont(alice.publish)(u.block(bob.id))(function (err) {
        if (err) throw err
      })
    }, false)
  })
})
