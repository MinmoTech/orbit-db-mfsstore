# orbit-db-mfsstore

[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/orbitdb/Lobby) [![Matrix](https://img.shields.io/badge/matrix-%23orbitdb%3Apermaweb.io-blue.svg)](https://riot.permaweb.io/#/room/#orbitdb:permaweb.io) [![Discord](https://img.shields.io/discord/475789330380488707?color=blueviolet&label=discord)](https://discord.gg/cscuf5T)
[![npm version](https://badge.fury.io/js/orbit-db-kvstore.svg)](https://badge.fury.io/js/orbit-db-kvstore)

> Key-Value database for orbit-db backed by IPFS MFS.

A key-value database backed by the IPFS Mutable File System. Also allows indexing and searching by non-primary indexes. Unlike other orbit-db stores it does not load the entire dataset into memory. Each store uses a schema and when records are inserted we build btree indexes. They get built and stored locally. 

Used in [orbit-db](https://github.com/haadcode/orbit-db).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Install
```
npm install orbit-db ipfs orbit-db-mfsstore
```

## Usage

First, create an instance of OrbitDB:

```javascript
const MfsStore = require('orbit-db-mfsstore')
const IPFS = require('ipfs')
const OrbitDB = require('orbit-db')

const ipfs = new IPFS()
const orbitdb = await OrbitDB.createInstance(ipfs)
```

Add custom datastore type

```javascript
OrbitDB.addDatabaseType("mfsstore", MfsStore)
```

Create a datastore with a schema. In this example we're saving baseball players. We'll add 4 different indexed fields. Indexes and can unique. 

```javascript
store = await orbitdb.open("baseballplayers", {
    create: true, 
    type: "mfsstore",
    schema: {
        name: { unique: false },
        currentTeam: { unique: false },
        battingHand: { unique: false },
        throwingHand: { unique: false }
    }
})
```

Add a record and retreive it by the primary key
```javascript


  //Save it
  await store.put(101, {
      name: "Andrew McCutchen",
      currentTeam: "PIT",
      battingHand: "R",
      throwingHand: "R"
  })


  //Retreive it
  let player = await store.get(101)


```

Now we're going to add a few more players

```javascript
  await store.put(102, {
    id: 102,
    name: "Pedro Alvarez",
    currentTeam: "BAL",
    battingHand: "R",
    throwingHand: "R"
  })

  await store.put(103, {
      id: 103,
      name: "Jordy Mercer",
      currentTeam: "PIT",
      battingHand: "L",
      throwingHand: "R"
  })

  await store.put(104, {
      id: 104,
      name: "Doug Drabek",
      currentTeam: "BAL",
      battingHand: "L",
      throwingHand: "R"
  })
```

Now retreive the values by the secondary indexes. 

```javascript
  
  //Get players who play for PIT
  let teamPIT = await store.getByIndex("currentTeam", "PIT", "desc", 0, 100)

  //Get players who who bat right handed. 
  let battingR = await store.getByIndex("battingHand", "R", "desc", 0, 100)


```

## API

See [orbit-db's API Documenations](https://github.com/haadcode/orbit-db/blob/master/API.md#kvstorename) for full details.

An MFSStore has the following additional functions:

### store.list(offset, limit)
* Returns a subset of the available records based on the offset and limit. Allows for paging.

```javascript
//Returns the recordset starting at the first record. Returns 100 records.
let result = await store.list(0, 100)
```

### store.getByIndex(indexName, value, sortDirection, offset, limit )
* Returns a subset of records stored in the index that match the passed in value. Offset and limit allow for paging.

```javascript
//Returns the recordset of records where the currentTeam attribute is set to "PIT". Sorts the records in descending order and starts at the first record. Returns 100 records.
let result = await store.getByIndex("currentTeam", "PIT", "desc", 0, 100 )
```

### store.count()
* Returns the total number of records stored in the store. Does not load the actual records into memory.

```javascript
let count = await store.count()
```

## Contributing

If you think this could be better, please [open an issue](https://github.com/orbitdb/orbit-db-kvstore/issues/new)!

Please note that all interactions in [@orbitdb](https://github.com/orbitdb) fall under our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) ©️ 2016-2018 Protocol Labs Inc., 2018 Haja Networks Oy
