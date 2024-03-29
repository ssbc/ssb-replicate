const cont = require('cont')
const tape = require('tape')
const pull = require('pull-stream')
const u = require('./util')

function once (fn) {
  let called = 0
  return function () {
    if (called++) throw new Error('called :' + called + ' times!')
    return fn.apply(this, arguments)
  }
}

// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.

const alice = u.createTestbot({
  name: 'block-alice',
  timeout: 1400
})

const bob = u.createTestbot({
  name: 'block-bob',
  timeout: 600
})

const carol = u.createTestbot({
  name: 'block-carol',
  timeout: 600
})

// const peers = [alice, bob, carol]
// pull(
//   alice.friends.createFriendStream({ meta: true, live: true }),
//   pull.drain(function (v) {
//     v.name = peers.find(peer => peer.id === v.id).name
//     console.log('alice:', v)
//   })
// )

tape('alice blocks bob, and bob cannot connect to alice', function (t) {
  // in the beginning alice and bob follow each other
  cont.para([
    cont(alice.publish)(u.follow(bob.id)),
    cont(bob.publish)(u.follow(alice.id)),
    cont(carol.publish)(u.follow(alice.id))
  ])(function (err) {
    if (err) throw err
    let n = 3; let rpc

    bob.connect(alice.getAddress(), function (err, _rpc) {
      if (err) throw err
      // replication will begin immediately.
      rpc = _rpc
      next()
    })

    // get the next messages that are replicated to alice and bob,
    // and check that these are the correct follow messages.
    const bobCancel = bob.post(once(function (op) {
      // should be the alice's follow(bob) message.
      t.equal(op.value.author, alice.id, 'bob expected message from alice')
      t.equal(op.value.content.contact, bob.id, 'bob expected message to be about bob')
      next()
    }), false)

    const aliceCancel = alice.post(once(function (op) {
      // should be the bob's follow(alice) message.
      t.equal(op.value.author, bob.id, 'alice expected to receive a message from bob')
      t.equal(op.value.content.contact, alice.id, 'alice expected received message to be about alice')
      next()
    }), false)
    function next () {
      if (--n) return

      rpc.close(true, function () {
        aliceCancel()
        bobCancel()
        cont(alice.publish)(u.block(bob.id))(function (err) {
          t.error(err, 'alice blocks bob')

          alice.friends.get(null, function (err, g) {
            if (err) throw err
            t.equal(g[alice.id][bob.id], false, 'alice is blocking bob')

            pull(
              alice.links({
                source: alice.id,
                dest: bob.id,
                rel: 'contact',
                values: true
              }),
              pull.filter(function (op) {
                return op.value.content.flagged != null
              }),
              pull.collect(function (err, ary) {
                if (err) throw err
                // console.log(ary)
                const flagged = ary.pop().value.content.flagged
                t.ok(flagged, 'alice did block bob')

                // since bob is blocked, he should not be able to connect
                bob.connect(alice.getAddress(), function (err, rpc) {
                  t.ok(err, 'bob is blocked, should fail to connect to alice')

                  const carolCancel = carol.post(function (msg) {
                    if (msg.author === alice.id) {
                      if (msg.sequence === 2) { t.end() }
                    }
                  })

                  // but carol, should, because she is not blocked.
                  carol.connect(alice.getAddress(), function (err, rpc) {
                    if (err) throw err
                    rpc.on('closed', function () {
                      carolCancel()
                      pull(
                        carol.createHistoryStream({ id: alice.id, seq: 0, live: false }),
                        pull.collect(function (err, ary) {
                          if (err) throw err

                          t.ok(ary.length, 'carol replicated data from alice')
                          // console.log(alice.id, carol.id, err, ary)
                          t.end()
                        })
                      )
                    })
                  })
                })
              })
            )
          })
        })
      })
    }
  })
})

tape('carol does not let bob replicate with alice', function (t) {
  // first, carol should have already replicated with alice.
  // emits this event when did not allow bob to get this data.
  bob.once('replicate:finish', function (vclock) {
    t.equal(vclock[alice.id], 1)
    // t.end()
  })
  bob.connect(carol.getAddress(), function (err, rpc) {
    if (err) throw err
    rpc.on('closed', function () {
      t.end()
    })
  })
})

tape('alice does not replicate messages from bob, but carol does', function (t) {
  let friends = 0
  // carol.friends.get(console.log)
  pull(
    carol.friends.createFriendStream({ meta: true, live: true }),
    pull.drain(function (v) {
      friends++
      // v.name = peers.find(peer => peer.id === v.id).name
      // console.log(v)
    })
  )

  cont.para([
    cont(alice.publish)(u.follow(carol.id)),
    cont(bob.publish)({ type: 'post', text: 'hello' }),
    cont(carol.publish)(u.follow(bob.id))
  ])(function (err, r) {
    t.error(err, 'published follows + a hello')
    const recv = { alice: 0, carol: 0 }
    carol.post(function (msg) {
      recv.carol++
      // will receive one message from bob and carol
    }, false)

    alice.post(function (msg) {
      recv.alice++
      // alice will only receive the message from carol, but not bob.
      t.equal(msg.value.author, carol.id, 'alice saw a message from carol')
    }, false)

    carol.friends.get(function (err, g) {
      t.error(err)
      t.ok(g[carol.id][bob.id], 'carol follows bob')
    })

    let n = 2
    carol.connect(alice.getAddress(), cb)
    carol.connect(bob.getAddress(), cb)

    function cb (err, rpc) {
      if (err) throw err
      rpc.on('closed', next)
    }
    function next () {
      if (--n) return
      pull(
        carol.createLogStream(),
        pull.collect(function (err, ary) {
          if (err) throw err
          carol.getVectorClock(function (err, vclock) {
            t.error(err)
            t.equals(vclock[alice.id], 3)
            t.equals(vclock[bob.id], 2)
            t.equals(vclock[carol.id], 2)

            t.equal(friends, 3, "carol's createFriendStream has 3 peers")
            t.end()
          })
        })
      )
    }
  })
})

// TODO test that bob is disconnected from alice if he is connected
//     and she blocks him.

// TODO test that blocks work in realtime. if alice blocks him
//     when he is already connected to alice's friend.

tape('cleanup!', function (t) {
  alice.close(true); bob.close(true); carol.close(true)
  t.end()
})
