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

    let value 

    try {
      value = await this.getFileContent(`/${this._dbname}/${key}.json`)
    } catch(ex) {
    }
    
    return value

  }

  async put(key, value) {

    //Need to remove any existing file for some reason. 
    //Occasionally without this the file would have the wrong contents. Not sure why.
    try {
      await this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
    } catch(ex) {}

    return this._ipfs.files.write(`/${this._dbname}/${key}.json`, JSON.stringify(value), {
      create: true
    })

  }



  async remove(key) {
    return this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
  }

  async count() {
    const fileList = await all(this._ipfs.files.ls(`/${this._dbname}`))
    return fileList.length - 1 //Don't count _handled.json
  }


  async all(offset=0, limit=1000) {

    const fileList = await this._ipfs.files.ls(`/${this._dbname}`)
    
    let count=0

    let results = []

    for await (const file of fileList) {

      if (results.length >= limit) break 
      if (file.name == "_handled.json") continue
      if (count < offset) continue 

      results.push(await this.getFileContent(`/${this._dbname}/${file.name}`))

      count++ 
    }


    return results

  }

  async getFileContent(filename) {
    let bufferedContents = await toBuffer(this._ipfs.files.read(filename))  // a buffer
    return JSON.parse(bufferedContents.toString())
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
    return this._ipfs.files.write(`/${this._dbname}/${HANDLED_FILENAME}`, JSON.stringify(this._handled), {
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
      if(!this._handled.includes(value.hash)) {
        toHandle.push(value)

        //We're actually going to have to include anything newer than this too or
        //we'll end up applying old updates. 

      }

    }
    
    await this.handleItems(toHandle)
    
  }

  async handleItems(toHandle) {

    if (!toHandle || toHandle.length == 0) return 

    for (let item of toHandle) {

      this._handled.push(item.hash)        

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
