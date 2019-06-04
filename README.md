# ssb-replicate

ssb legacy replication. this was previously built into `ssb-server` (formerly known as `scuttlebot`)

## protocol

peers replicate by calling `createHistoryStream({id, seq})` for every feed to be replicate.
(if `replicate.request({id: <id>, replicate: true})` has been called - this is usually handled
by `ssb-friends`). (`id` is the replicated feed id, and seq is the latest sequence number a peer has)

see [the protocol guide](https://ssbc.github.io/scuttlebutt-protocol-guide/#createHistoryStream)

Since an ssb peer may replicate thousands of feeds, just making all these calls to `createHistoryStream`
can use quite a bit of bandwidth (and cpu on the receiving end) thus this module has been superceded
by [ssb-ebt](https://github.com/ssbc/ssb-ebt). but this is still included so for interop with other
old instances.

Also note, when a peer connects, at first only a single `createHistoryStream` is requested for the peer's
own feed - then it waits to see if the remote peer makes any `createHistoryStream` requests before
making more, this avoids hammering a peer not supporting legacy replication with thousands of requests.

## usage

```
var createSSB = require('ssb-server')
  .use(require('ssb-replicate'))

var sbot = createSSB({config...})
```

## config

```
{
  replicate: {
    legacy: boolean, // whether to support legacy replication.
                     // if set to false, another plugin must provide replication.
                     // (such as ssb-ebt)
    fallback: boolean, //if enabled, wait for another plugin to try to replicate first.
                       //if set will not start to replicate until replicate:fallback event is emitted on the rpc connection.
  }
}

```

## api

### replicate.request({id:feedId, replicate:replicate}) : sync

request that `feedId` be replicated (or not if `replicate` is false.
will begin or end replication on any currently open connections.

### replicate.changes : source

get a feed of replication progress.

### replicate.block : sync

call when `from` blocks `to`: block(from, to, isBlocking).

### replicate.upto : source

returns {} of feeds to replicate, with sequences.


## License

MIT


