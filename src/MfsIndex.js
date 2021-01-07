'use strict'

const toBuffer = require('it-to-buffer')
const all = require('it-all')

const { SortedMap } = require('immutable-sorted')

const stringify = require('fast-json-stable-stringify')


const HANDLED_FILENAME = "_handled.json"
const INDEX_MAPS_FILENAME = "_trees.json"

class MfsIndex {

  constructor(ipfs, dbname, schema) {
    this._dbname = dbname.path
    this._ipfs = ipfs

    this._handled = []
    this._indexMaps = {}
    this._schema = schema

  }

  async get(key) {

    let value

    try {
      value = await this.getFileContent(`/${this._dbname}/${key}.json`)
    } catch (ex) { }

    return value

  }

  async getByIndex(indexName, value, sortDirection, offset=0, limit=1 ) {

    if (!this._schema) return []

    let definition = this._schema[indexName]
    if (!definition) return []

    let indexMap = this._indexMaps[indexName]
    if (!indexMap) return []

    let results = []

    let primaryKeys = []


    if (value) {

      if (definition.unique) {

        let primaryKey = indexMap.get(value)
        primaryKeys.push(primaryKey)
  
      } else {
  
        let list = indexMap.get(value)
        
        for (let primaryKey of list) {
          primaryKeys.push(primaryKey)
        }
  
      }
  
    } else {

      //Return all
      primaryKeys = Object.keys(indexMap.toSeq().toJS())
    }


    //Sort
    primaryKeys.sort()
    if (sortDirection == "asc") primaryKeys.reverse()



    //Look up actual values
    let count = 0

    for (let primaryKey of primaryKeys) {

      if (results.length >= limit) break

      if (count < offset) {
        count++
        continue
      } else {
        count++
      }

      results.push(await this.get(primaryKey))

    }



    return results

  }


  async put(key, value) {

    let existing = await this.get(key)

    for (let columnName in this._schema) {
      await this._updateMap(columnName, key, value[columnName], existing ? existing[columnName] : undefined)
    }

    await this._flushIndexMaps()

    //Need to remove any existing file for some reason. 
    //Occasionally without this the file would have the wrong contents. Not sure why.
    if (existing) {
      await this.remove(key)
    }

    await this._ipfs.files.write(`/${this._dbname}/${key}.json`, stringify(value), {
      create: true
    })

  }



  async remove(key) {

    //Remove from all index trees
    let existing = await this.get(key)

    for (let columnName in this._schema) {
      await this._updateMap(columnName, key, undefined, existing ? existing[columnName] : undefined)
    }

    await this._flushIndexMaps()

    return this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
  }

  async count() {
    const fileList = await all(this._ipfs.files.ls(`/${this._dbname}`))

    let records = fileList.filter(file => file.type=='file').length

    return records//Don't count _handled.json
  }


  async list(offset = 0, limit = 1000) {

    const fileList = await this._ipfs.files.ls(`/${this._dbname}`, {
      sort: true
    })

    let count = 0

    let results = []

    for await (const file of fileList) {

      if (results.length >= limit) break
      if (file.type == 'directory') continue

      if (count < offset) {
        count++
        continue
      } else {
        count++
      }

      results.push(await this.getFileContent(`/${this._dbname}/${file.name}`))


    }


    return results

  }

  async getFileContent(filename) {
    let bufferedContents = await toBuffer(this._ipfs.files.read(filename)) 
    return JSON.parse(bufferedContents.toString())
  }




  async updateIndex(oplog) {

    let toHandle = []

    let values = oplog.values
      .slice()

    //Figure out which have been handled 
    for (let value of values) {

      //If it's not been handled mark it
      if (!this._handled.includes(value.hash)) {
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
    } catch (ex) { }

  }





  async load() {

    await this._createStoreDirectory()

    try {
      //Load handled list
      this._handled = await this._loadHandled()

      //Load index maps
      this._indexMaps = await this._loadIndexMaps()

    } catch (ex) { }
  }

  async _loadHandled() {

    let handled = []

    try {
      handled = await this.getFileContent(`/${this._dbname}/handled/${HANDLED_FILENAME}`)
    } catch (ex) { }

    return handled
  }

  async _loadIndexMaps() {

    let indexMaps = {}

    try {
      let loadedMaps = await this.getFileContent(`/${this._dbname}/indexMaps/${INDEX_MAPS_FILENAME}`)

      for (let columnName in loadedMaps) {
        indexMaps[columnName] = SortedMap(loadedMaps[columnName])
      }

    } catch(ex) {
      for (let columnName in this._schema) {
        indexMaps[columnName] = SortedMap()
      }
    }

    return indexMaps
  }

  async _flushIndexMaps() {

    //Gotta delete before saving or it gets messed up
    try {
      // let stat = await this._ipfs.files.stat(`/${this._dbname}/indexMaps/${INDEX_MAPS_FILENAME}`)
      await this._ipfs.files.rm(`/${this._dbname}/indexMaps/${INDEX_MAPS_FILENAME}`)
    } catch(ex) {}

    await this._ipfs.files.write(`/${this._dbname}/indexMaps/${INDEX_MAPS_FILENAME}`, stringify(this._indexMaps), {
      create: true,
      parents: true
    })

  }

  async _createStoreDirectory() {

    try {
      let stat = await this._ipfs.files.stat(`/${this._dbname}`)
    } catch (ex) {
      await this._ipfs.files.mkdir(`/${this._dbname}`)
    }

  }

  async saveHandled() {
    return this._ipfs.files.write(`/${this._dbname}/handled/${HANDLED_FILENAME}`, stringify(this._handled), {
      create: true,
      parents: true
    })
  }



  async _updateMap(mapName, primaryKey, mapKey, existingMapKey) {

    const indexMap = this._indexMaps[mapName]
    if (!indexMap) return 

    let definition = this._schema[mapName]
    if (!definition) return 

    //The key is the value of the indexed field. 
    // let mapKey = value ? value[indexName] : null


    if (definition.unique) {

      if (mapKey) {
      
        this._indexMaps[mapName] = indexMap.set(mapKey, primaryKey)
      
      } else {

        if (existingMapKey) {
          indexMap.delete(existingMapKey)
        }

      }

    } else {

      //Otherwise we're storing a list of values. Append this to it.
      let isNew = ( !existingMapKey && mapKey)
      let isChanged = ( !isNew && ( mapKey != existingMapKey ) )

      if (existingMapKey && isChanged) {
        //Remove from current list
        let currentList = indexMap.get(existingMapKey)

        let currentIndex = currentList.indexOf(primaryKey)

        if (currentIndex >= 0) {
          currentList.splice(currentIndex, 1)
        }

      }

      //If there's an actual value then insert it
      if (mapKey && (isChanged || isNew)) {
        let currentList = indexMap.get(mapKey)

        if (!currentList) {
          currentList = [] 
          this._indexMaps[mapName] = indexMap.set(mapKey, currentList)
        }

        currentList.push(primaryKey)

      }

    }

  }



}

module.exports = MfsIndex
