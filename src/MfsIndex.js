'use strict'

const toBuffer = require('it-to-buffer')
const all = require('it-all')

const BTree = require('./BTree')
const stringify = require('fast-json-stable-stringify');


const HANDLED_FILENAME = "_handled.json"

class MfsIndex {

  constructor(ipfs, dbname, schema) {
    this._dbname = dbname.path
    this._ipfs = ipfs

    this._handled = []
    this._trees = {}
    this._schema = schema
  }

  async get(key) {

    let value

    try {
      value = await this.getFileContent(`/${this._dbname}/${key}.json`)
    } catch (ex) { }

    return value

  }

  async getByIndex(indexName, value, limit=1, offset=0 ) {

    let definition = this._schema[indexName]
    if (!definition) return []

    let tree = await this._getTreeByName(indexName)
    if (!tree) return []


    let results = []

    if (definition.unique) {

      let primaryKey = tree.get(value)
      results.push(await this.get(primaryKey))

    } else {

      let list = tree.get(value)
      
      for (let primaryKey of list) {
        results.push(await this.get(primaryKey))
      }

    }

    return results

  }


  async put(key, value) {

    let existing = await this.get(key)

    for (let columnName in this._schema) {
      await this._updateTree(columnName, key, value[columnName], existing ? existing[columnName] : undefined)
    }

    //Need to remove any existing file for some reason. 
    //Occasionally without this the file would have the wrong contents. Not sure why.
    if (existing) {
      await this.remove(key)
    }

    return this._ipfs.files.write(`/${this._dbname}/${key}.json`, stringify(value), {
      create: true
    })

  }



  async remove(key) {
    return this._ipfs.files.rm(`/${this._dbname}/${key}.json`)
  }

  async count() {
    const fileList = await all(this._ipfs.files.ls(`/${this._dbname}`))


    let records = fileList.filter(file => file.type==0).length

    return records//Don't count _handled.json
  }


  async list(offset = 0, limit = 1000) {

    const fileList = await this._ipfs.files.ls(`/${this._dbname}`)

    let count = 0

    let results = []

    for await (const file of fileList) {

      if (results.length >= limit) break
      if (file.type == 1) continue

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
    let bufferedContents = await toBuffer(this._ipfs.files.read(filename))  // a buffer
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
      this._handled = await this.getFileContent(`/${this._dbname}/handled/${HANDLED_FILENAME}`)

      //Load btrees

      //Load schema

    } catch (ex) { }
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


  async saveBtree(name) {

    let values = []

    let btree = this._trees[name]

    if (btree.tree.count() > 0) {
      btree.tree.walkDesc(function (key, value) {
        values[key] = value
      })
    }

    return this._ipfs.files.write(`/${this._dbname}/trees/${name}.json`, stringify(values), {
      create: true,
      parents: true
    })

  }

  async loadBtree(name) {

    let btree = new BTree(this._ipfs)
    let data = {}

    try {
      data = await this.getFileContent(`/${this._dbname}/trees/${name}.json`)
    } catch (ex) {
      // console.log(ex)
    }

    for (let key in data) {
      btree.put(key, data[key])
    }

    return btree

  }


  async _getTreeByName(name) {

    //If it's already loaded just return it.
    if (this._trees[name]) {
      return this._trees[name]
    }

    this._trees[name] = await this.loadBtree(name)

    return this._trees[name]

  }


  async _updateTree(treeName, primaryKey, treeKey, existingTreeKey) {

    const tree = await this._getTreeByName(treeName)

    let definition = this._schema[treeName]

    //The key is the value of the indexed field. 
    // let treeKey = value ? value[indexName] : null


    if (definition.unique) {

      if (treeKey) {
      
        tree.put(treeKey, primaryKey)
      
      } else {

        if (existingTreeKey) {
          tree.del(existingTreeKey)
        }

      }

    } else {

      //Otherwise we're storing a list of values. Append this to it.
      let isNew = ( !existingTreeKey && treeKey)
      let isChanged = ( !isNew && ( treeKey != existingTreeKey ) )

      if (existingTreeKey && isChanged) {
        //Remove from current list
        let currentList = tree.get(existingTreeKey)

        let currentIndex = currentList.indexOf(primaryKey)

        if (currentIndex >= 0) {
          currentList.splice(currentIndex, 1)
        }

      }

      //If there's an actual value then insert it
      if (treeKey && (isChanged || isNew)) {
        let currentList = tree.get(treeKey)

        if (!currentList) {
          currentList = [] 
          tree.put(treeKey, currentList)
        }

        currentList.push(primaryKey)

      }

    }

    await this.saveBtree(treeName)

  }



}

module.exports = MfsIndex
