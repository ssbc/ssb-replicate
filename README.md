# ssb-replicate

ssb legacy replication. this was previously built into `ssb-server` (formerly known as `scuttlebot`)

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
                      //if set will not start to replacte until replicate:fallback event is emitted on the rpc connection.
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

call when from blocks to: block(from, to, isBlocking).

### replicate.upto : source

returns {} of feeds to replicate, with sequences.


## License

MIT
