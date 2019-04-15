
module.exports = {
  description: 'legacy replication & stub api for replication',
  commands: {
    request: {
      type: 'sync',
      description: 'request a specific feed to be replicated or not',
      args: {
        id: {
          type: 'FeedId',
          description: 'FeedId to enable or disable replication'
        },
        replicate: {
          type: 'boolean',
          description: 'wether to replicate this feed, defaults to true'
        }
      }

    },
    block: {
      type: 'sync',
      description: 'block or unblock replication of a feed',
      args: {
        from: {
          type: 'FeedId',
          description: 'feed id which created the block'
        },
        to: {
          type: 'FeedId',
          description: 'feed id which was blocked'
        },
        blocking: {
          type: 'boolean',
          description: 'wether this is a block or unblock, defaults to unblock (false)'
        }
      }
    },
    upto: {
      type: 'source',
      description: 'stream {id, sequence} tuples of the sequence you are up to for every feed',
      args: {
        live: {
          type: 'boolean',
          description: 'include real time changes to replication state, such as new feeds followed'
        }
      }
    },
    changes: {
      type: 'source',
      description: 'stream of replication change events, recommend polling sbot.progress instead',
      args: {}
    }
  }
}


