const cont = require('cont')
const tape = require('tape')
const u = require('./util')

const alice = u.createTestbot({
  name: 'block2-alice' // timeout: 1400,
})

const bob = u.createTestbot({
  name: 'block2-bob' // timeout: 600,
})

tape('alice blocks bob while he is connected, she should disconnect him', function (t) {
  // in the beginning alice and bob follow each other
  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id))
  ])(function (err) {
    t.error(err, 'follows published')

    bob.connect(alice.getAddress(), function (err, rpc) {
      t.error(err, 'bob connects to alice')
      // replication will begin immediately.
    })

    bob.on('replicate:finish', function (vclock) {
      // console.log(vclock)
      t.equal(vclock[alice.id], 1, 'bob has 1 message from alice')
      alice.close()
      bob.close()
      t.end()
    })

    let once = false
    bob.post(function (op) {
      if (op.value.author === bob.id) return
      // console.log('BOB RECV', bob.id, op)
      if (once) throw new Error('should only be called once')
      once = true
      // should be the alice's follow(bob) message.

      t.equal(op.value.content.contact, bob.id)
      cont(alice.publish)(u.block(bob.id))(function (err) {
        t.error(err, 'alice blocks bob')
        cont(alice.publish)({ type: 'not-for-bob' })(function (err) {
          t.error(err, 'alice publishes new content')
        })
      })
    }, false)
  })
})
