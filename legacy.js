/* eslint-disable camelcase */
const pull = require('pull-stream')
const Notify = require('pull-notify')
const Cat = require('pull-cat')
const Debounce = require('observ-debounce')
const deepEqual = require('deep-equal')
const isFeed = require('ssb-ref').isFeed
const Pushable = require('pull-pushable')
const detectSync = require('./detect-sync')

// compatibility function for old implementations of `latestSequence`
// function toSeq (s) {
//   return 'number' === typeof s ? s : s.sequence
// }
// function last (a) { return a[a.length - 1] }

function isObject (o) {
  return o && typeof o === 'object'
}

// if one of these shows up in a replication stream, the stream is dead
const streamErrors = {
  'unexpected end of parent stream': true, // stream closed okay
  'unexpected hangup': true, // stream closed probably okay
  'read EHOSTUNREACH': true,
  'read ECONNRESET': true,
  'read ENETDOWN': true,
  'read ETIMEDOUT': true,
  'write ECONNRESET': true,
  'write EPIPE': true,
  'stream is closed': true, // rpc method called after stream ended
  'parent stream is closing': true
}

module.exports = function (ssbServer, notify, config) {
  const debounce = Debounce(200)
  const listeners = {}
  const newPeers = Notify()

  let start = null
  let count = 0
  let rate = 0
  let toSend = {}
  const peerHas = {}
  const pendingFeedsForPeer = {}
  let lastProgress = null

  const replicate = {}
  const blocks = {}

  function request (id, unfollow) {
    if (isObject(id)) {
      unfollow = id.replicate
      id = id.id
    }
    if (unfollow === false) {
      if (replicate[id]) {
        delete replicate[id]
        newPeers({ id, sequence: -1 })
      }
    } else if (!replicate[id]) {
      replicate[id] = true
      newPeers({ id, sequence: toSend[id] || 0 })
    }
  }

  ssbServer.getVectorClock(function (err, clock) {
    if (err) throw err
    toSend = clock
  })

  ssbServer.post(function (msg) {
    // this should be part of ssb.getVectorClock
    toSend[msg.value.author] = msg.value.sequence
    debounce.set()
  })

  debounce(function () {
    // only list loaded feeds once we know about all of them!
    const feeds = Object.keys(toSend).length
    let legacyProgress = 0
    let legacyTotal = 0

    const pendingFeeds = new Set()
    const pendingPeers = {}
    const legacyToRecv = {}

    Object.keys(pendingFeedsForPeer).forEach(function (peerId) {
      if (pendingFeedsForPeer[peerId] && pendingFeedsForPeer[peerId].size) {
        Object.keys(toSend).forEach(function (feedId) {
          if (peerHas[peerId] && peerHas[peerId][feedId]) {
            if (peerHas[peerId][feedId] > toSend[feedId]) {
              pendingFeeds.add(feedId)
            }
          }
        })
        pendingPeers[peerId] = pendingFeedsForPeer[peerId].size
      }
    })

    for (const k in toSend) {
      legacyProgress += toSend[k]
    }

    for (const id in peerHas) {
      for (const k in peerHas[id]) {
        legacyToRecv[k] = Math.max(peerHas[id][k], legacyToRecv[k] || 0)
      }
    }

    for (const k in legacyToRecv) {
      if (toSend[k] !== null) {
        legacyTotal += legacyToRecv[k]
      }
    }

    const progress = {
      id: ssbServer.id,
      rate, // rate of messages written to ssbServer
      feeds, // total number of feeds we want to replicate
      pendingPeers, // number of pending feeds per peer
      incompleteFeeds: pendingFeeds.size, // number of feeds with pending messages to download

      // LEGACY: Preserving old api. Needed for test/random.js to pass
      progress: legacyProgress,
      total: legacyTotal
    }

    if (!deepEqual(progress, lastProgress)) {
      lastProgress = progress
      notify(progress)
    }
  })

  pull(
    ssbServer.createLogStream({ old: false, live: true, sync: false, keys: false }),
    pull.drain(function (e) {
      // track writes per second, mainly used for developing initial sync.
      if (!start) start = Date.now()
      const time = (Date.now() - start) / 1000
      if (time >= 1) {
        rate = count / time
        start = Date.now()
        count = 0
      }
      const pushable = listeners[e.author]

      if (pushable && pushable.sequence === e.sequence) {
        pushable.sequence++
        pushable.forEach(function (p) {
          p.push(e)
        })
      }
      count++
    })
  )

  ssbServer.createHistoryStream.hook(function (fn, args) {
    const upto = args[0] || {}
    const remote_id = this.id
    let stream
    // if they are blocked, just end immediately.
    // better would be same error as if we didn't have this feed.
    if (blocks[upto.id] && blocks[upto.id][remote_id]) {
      return function (abort, cb) {
        cb(true) // eslint-disable-line
      }
    }

    const seq = upto.sequence || upto.seq
    if (this._emit) this._emit('call:createHistoryStream', args[0])

    // if we are calling this locally, skip cleverness
    if (this === ssbServer) return fn.call(this, upto)

    // keep track of each requested value, per feed / per peer.
    peerHas[remote_id] = peerHas[remote_id] || {}
    peerHas[remote_id][upto.id] = seq - 1 // peer requests +1 from actual last seq

    debounce.set()

    // handle creating lots of history streams efficiently.
    // maybe this could be optimized in map-filter-reduce queries instead?
    if (toSend[upto.id] == null || (seq > toSend[upto.id])) {
      upto.old = false
      if (!upto.live) return pull.empty()
      const pushable = listeners[upto.id] = listeners[upto.id] || []
      const p = Pushable(function () {
        const i = pushable.indexOf(p)
        pushable.splice(i, 1)
      })
      pushable.push(p)
      pushable.sequence = seq
      stream = p
    } else { stream = fn.call(this, upto) }

    return pull(
      stream,
      // this is pulled in from ssb-friends. because we decided replication should own block.
      /*
        edge case: if A is replicating B from C in real time as B blocks A,
        C allows A to continue replicating B's messages, until the block message appears.
        but would not allow A to replicate any of B on the next connection.
        if B blocks in a private message to C, this may allow A to replicate past the block message,
        or if B blocks A via a blocklist, there may be no message.
        this is still currently good enough but will need to change in the future.
      */
      pull.take(function (msg) {
        // handle when createHistoryStream is called with keys: true
        if (!msg.content && msg.value.content) { msg = msg.value }
        if (msg.content.type !== 'contact') return true
        return !(
          (msg.content.flagged || msg.content.blocking) &&
          msg.content.contact === remote_id
        )
      })
    )
  })

  // collect the IDs of feeds we want to request
  const opts = config.replication || {}
  opts.hops = opts.hops || 3
  opts.dunbar = opts.dunbar || 150
  opts.live = true
  opts.meta = true

  function upto (opts) {
    opts = opts || {}
    const ary = Object.keys(replicate).map(function (k) {
      return { id: k, sequence: toSend[k] || 0 }
    })
    if (opts.live) {
      return Cat([
        pull.values(ary),
        pull.once({ sync: true }),
        newPeers.listen()
      ])
    }

    return pull.values(ary)
  }

  ssbServer.on('rpc:connect', function (rpc) {
    // this is the cli client, just ignore.
    if (rpc.id === ssbServer.id) return
    if (!ssbServer.ready()) return

    const errorsSeen = {}
    let drain

    function replicate (upto, cb) {
      pendingFeedsForPeer[rpc.id] = pendingFeedsForPeer[rpc.id] || new Set()
      pendingFeedsForPeer[rpc.id].add(upto.id)

      debounce.set()

      pull(
        rpc.createHistoryStream({
          id: upto.id,
          seq: (upto.sequence || upto.seq || 0) + 1,
          live: true,
          keys: false
        }),

        pull.through(detectSync(rpc.id, upto, toSend, peerHas, function () {
          if (pendingFeedsForPeer[rpc.id]) {
            // this peer has finished syncing, remove from progress
            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          }
        })),

        ssbServer.createWriteStream(function (err) {
          if (err && !(err.message in errorsSeen)) {
            errorsSeen[err.message] = true
            if (err.message in streamErrors) {
              cb && cb(err)
              if (err.message === 'unexpected end of parent stream') {
                if (err instanceof Error) {
                  // stream closed okay locally
                } else {
                  // pre-emptively destroy the stream, assuming the other
                  // end is packet-stream 2.0.0 sending end messages.
                  rpc.close(err)
                }
              }
            } else {
              console.error(
                'Error replicating with ' + rpc.id + ':\n  ',
                err
              )
            }
          }

          // if stream closes, remove from pending progress
          if (pendingFeedsForPeer[rpc.id]) {
            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          }
        })
      )
    }

    let replicate_self = false
    // if replicate.fallback is enabled
    // then wait for the fallback event before
    // starting to replicate by this strategy.
    if (config.replicate && config.replicate.fallback) { rpc.once('fallback:replicate', fallback) } else { fallback() }

    function fallback () {
      // if we are not configured to use EBT, then fallback to createHistoryStream
      if (replicate_self) return
      replicate_self = true
      replicate({ id: ssbServer.id, sequence: toSend[ssbServer.id] || 0 })
    }

    // trigger this if ebt.replicate fails...
    rpc.once('call:createHistoryStream', next)

    let started = false
    function next () {
      if (started) return
      started = true
      ssbServer.emit('replicate:start', rpc)

      rpc.on('closed', function () {
        ssbServer.emit('replicate:finish', toSend)

        // if we disconnect from a peer, remove it from sync progress
        delete pendingFeedsForPeer[rpc.id]
        debounce.set()
      })

      // make sure we wait until the clock is loaded
      pull(
        upto({ live: opts.live }),
        drain = pull.drain(function (upto) {
          if (upto.sync) return
          if (!isFeed(upto.id)) throw new Error('expected feed!')
          if (!Number.isInteger(upto.sequence)) throw new Error('expected sequence!')

          if (upto.id === ssbServer.id && replicate_self) {
            replicate_self = true
            return
          }
          replicate(upto, function (err) {
            if (err) {
              if (err.message !== 'stream is closed') {
                console.error(Error('replication error', { cause: err }))
              }
            }
            drain.abort()
          })
        }, function (err) {
          if (err && err !== true) {
            ssbServer.emit('log:error', ['replication', rpc.id, 'error', err])
          }
        })
      )
    }
  })

  return {
    request,
    upto,
    changes: notify.listen,
    block (from, to, blocking) {
      if (isObject(from)) {
        to = from.to
        blocking = from.blocking
        from = from.from
      }
      if (blocking) {
        blocks[from] = blocks[from] || {}
        blocks[from][to] = blocking
      } else if (blocks[from]) {
        delete blocks[from][to]
      }
    },
    help () {
      return require('./help')
    }
  }
}
