const cont = require('cont')
const tape = require('tape')
const ssbKeys = require('ssb-keys')
const u = require('./util')

const createSsbServer = u.testbot

const alice = createSsbServer({
  name: 'test-block-alice-2', // timeout: 1400,
  keys: ssbKeys.generate()
})

const bob = createSsbServer({
  name: 'test-block-bob-2', // timeout: 600,
  keys: ssbKeys.generate()
})

tape('alice blocks bob while he is connected, she should disconnect him', function (t) {
  // in the beginning alice and bob follow each other
  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id))
  ])(function (err) {
    if (err) throw err

    bob.connect(alice.getAddress(), function (err, rpc) {
      if (err) throw err
      // replication will begin immediately.
    })

    bob.on('replicate:finish', function (vclock) {
      console.log(vclock)
      t.equal(vclock[alice.id], 1)
      alice.close()
      bob.close()
      t.end()
    })

    let once = false
    bob.post(function (op) {
      if (op.value.author === bob.id) {
        console.log('ignore ' + op.value.content.type)
        return
      }
      console.log('BOB RECV', op)
      if (once) throw new Error('should only be called once')
      once = true
      // should be the alice's follow(bob) message.

      t.equal(op.value.content.contact, bob.id)
      cont(alice.publish)(u.block(bob.id))(err => { if (err) throw err })
    }, false)
  })
})
