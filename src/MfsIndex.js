'use strict'

const toBuffer = require('it-to-buffer')
const all = require('it-all')


const HANDLED_FILENAME = "_handled.json"

class MfsIndex {
  constructor(ipfs, dbname) {
    this._dbname = dbname.path
    this._ipfs = ipfs 
    this._handled = []
  }

  async get(key) {

    try {

      return this.getFileContent(`/${this._dbname}/${key}.json`)

    } catch(ex) {}
    
  }

  async put(key, value) {


    //Need to remove any existing file for some reason. 
    //Occasionally without this the file would have the wrong contents. Not sure why.
    try {
      await this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
    } catch(ex) {}


    let stringify = JSON.stringify(value)
    let buffer = Buffer.from(stringify)
    
    return this._ipfs.files.write(`/${this._dbname}/${key}.json`, buffer, {
      create: true
    })

  }



  async remove(key) {
    return this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
  }

  async count() {

    let stat = await this._ipfs.files.stat(`/${this._dbname}`)

    // const result = await all(this._ipfs.files.ls(`/${this._dbname}`))

    // console.log(stat)
    // console.log(result)

    if (stat) {
      return stat.blocks -1 //Don't count _handled.json
    }

    return 0
  }


  async all(offset=0, limit=0) {

    const fileList = await all(this._ipfs.files.ls(`/${this._dbname}`))

    let results = []

    limit = Math.max(fileList.length, offset+limit)

    for (let i=offset; i < limit; i++ ) {

      let file = fileList[i]

      if (file.name == "_handled.json") continue

      results.push(await this.getFileContent(`/${this._dbname}/${file.name}`))
    }

    return results

  }

  async getFileContent(filename) {
    let bufferedContents = await toBuffer(this._ipfs.files.read(filename))  // a buffer
    let content = bufferedContents.toString()
    return JSON.parse(content)
  }



  async loadHandled() {

    await this.createStoreDirectory()

    try {
      let bufferedContents = await toBuffer(this._ipfs.files.read(`/${this._dbname}/${HANDLED_FILENAME}`))  // a buffer
      this._handled = JSON.parse(bufferedContents.toString())
    } catch(ex) {}

  }

  async createStoreDirectory() {

    try {
      let stat = await this._ipfs.files.stat(`/${this._dbname}`)
    } catch (ex) {
      await this._ipfs.files.mkdir(`/${this._dbname}`)
    }

  }


  async saveHandled() {
    
    let stringify = JSON.stringify(this._handled)
    let buffer = Buffer.from(stringify)

    await this._ipfs.files.write(`/${this._dbname}/${HANDLED_FILENAME}`, buffer, {
      create: true,
      parents: true
    })
  }

  async updateIndex(oplog) {

    let toHandle = []

    let values = oplog.values
      .slice()
      .reverse()

    //Figure out which have been handled 
    for (let value of values) {

      //If it's not been handled mark it
      if(!this._handled.includes(value.clock.time)) {
        toHandle.push(value)
      }

    }
    
    await this.handleItems(toHandle)
    
  }

  async handleItems(toHandle) {

    for (let item of toHandle) {

      this._handled.push(item.clock.time)        

      if (item.payload.op === 'PUT') {
        await this.put(item.payload.key, item.payload.value)
      }
      else if (item.payload.op === 'DEL') {
        await this.remove(item.payload.key)
      }
    }

    await this.saveHandled()


  }

  async drop() {

    try {
      let stat = await this._ipfs.files.stat(`/${this._dbname}`)

      return this._ipfs.files.rm(`/${this._dbname}`)
    } catch(ex) {}
    
  }

}

module.exports = MfsIndex
