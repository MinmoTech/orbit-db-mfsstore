'use strict'

const Store = require('orbit-db-store')
const MfsIndex = require('./MfsIndex')

class MfsStore extends Store {
  constructor(ipfs, id, dbname, options) {

    //Wrap the index in a wrapper to let us pass it the ipfs instance that we get
    class IndexWrapper extends MfsIndex {
      constructor() {
        super(ipfs, dbname)
      }
    }
 
    let opts = Object.assign({}, { Index: IndexWrapper })
    Object.assign(opts, options)
    super(ipfs, id, dbname, opts)
    this._type = 'mfsstore'
  }

  get all () {
    return this._index._index
  }

  async get (key) {
    return this._index.get(key)
  }

  async set (key, data, options = {}) {
    return this.put(key, data, options)
  }

  async put (key, data, options = {}) {
    return this._addOperation({
      op: 'PUT',
      key: key,
      value: data
    }, options)
  }

  async del (key, options = {}) {
    return this._addOperation({
      op: 'DEL',
      key: key,
      value: null
    }, options)
  }

  // async _updateIndex () {
  //   this._recalculateReplicationMax()
  //   await this._index.updateIndex(this._oplog)
  //   this._recalculateReplicationProgress()
  // }

  // async _addOperation (data, { onProgressCallback, pin = false } = {}) {
  //   async function addOperation () {
  //     if (this._oplog) {
  //       // check local cache?
  //       if (this.options.syncLocal) {
  //         await this.syncLocal()
  //       }

  //       const entry = await this._oplog.append(data, this.options.referenceCount, pin)
  //       this._recalculateReplicationStatus(this.replicationStatus.progress + 1, entry.clock.time)
  //       await this._cache.set(this.localHeadsPath, [entry])
  //       await this._updateIndex()
  //       this.events.emit('write', this.address.toString(), entry, this._oplog.heads)
  //       if (onProgressCallback) onProgressCallback(entry)
  //       return entry.hash
  //     }
  //   }
  //   return this._opqueue.add(addOperation.bind(this))
  // }


}

module.exports = MfsStore
