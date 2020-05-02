'use strict'

const toBuffer = require('it-to-buffer')

const HANDLED_FILENAME = "_handled.json"

class MfsIndex {
  constructor(ipfs, dbname) {
    this._dbname = dbname.path
    this._ipfs = ipfs 
    this._handled = []
  }

  async get(key) {
    let content

    try {

      let stat = await this._ipfs.files.stat(`/${this._dbname}/${key}.json`)

      let bufferedContents = await toBuffer(this._ipfs.files.read(`/${this._dbname}/${key}.json`))  // a buffer
      content = bufferedContents.toString()
  
      return JSON.parse(content)

    } catch(ex) {
      console.log('here')
    }
    
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
}

module.exports = MfsIndex
