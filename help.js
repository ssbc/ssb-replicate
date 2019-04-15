
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
    }
  }
}


