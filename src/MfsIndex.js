'use strict'

const toBuffer = require('it-to-buffer')

class MfsIndex {
  constructor(ipfs, dbname) {
    this._dbname = dbname.path
    this._ipfs = ipfs 

  }

  async get(key) {
    let bufferedContents = await toBuffer(this._ipfs.files.read(`/${this._dbname}/${key}.json`))  // a buffer
    return JSON.parse(bufferedContents.toString())
  }

  async put(key, value) {

  }

  async updateIndex(oplog) {
    console.time('oplog')

    await oplog.values
      .slice()
      .reverse()
      .reduce(async (handled, item) => {

        handled = await handled

        if(!handled.includes(item.payload.key)) {
          
          handled.push(item.payload.key)

          if(item.payload.op === 'PUT') {
            
            console.time('saving')
            let buffer = Buffer.from(JSON.stringify(item.payload.value))
            await this._ipfs.files.write(`/${this._dbname}/${item.payload.key}.json`, buffer, {
              create: true,
              parents: true
            })
            console.timeEnd('saving')
          
          } else if(item.payload.op === 'DEL') {
            await this._ipfs.files.rm(`/${this._dbname}/${item.payload.key}.json`)
          }

        } 
        return handled
      }, [])


    console.timeEnd('oplog')
  }
}

module.exports = MfsIndex
