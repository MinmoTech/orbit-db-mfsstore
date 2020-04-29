// @ts-nocheck
const MfsStore = require('../src/MfsStore')

var assert = require('assert')

const OrbitDB = require('orbit-db')
const IPFS = require('ipfs')



describe('MfsStore', async () => {

    let store

    before('Setup', async () => {


        OrbitDB.addDatabaseType("mfsstore", MfsStore)

        
        let ipfs = await IPFS.create({
            repo: './test/test-repos/' + Math.random().toString()
    
        })

        let orbitdb = await OrbitDB.createInstance(ipfs)
        store = await orbitdb.open("testtable", {
            create: true, 
            type: "mfsstore"
        })

        await store.load()
    })



    it('should put items in the store and retreive them by key', async () => {

        //Arrange 
        await store.put(1, {
            id: 1,
            name: "Pat"
        })

        await store.put(2, {
            id: 2,
            name: "Bill"
        })

        await store.put(3, {
            id: 3,
            name: "Jim"
        })

        await store.put(4, {
            id: 4,
            name: "Susan"
        })


        //Act
        let pat = await store.get(1)
        let bill = await store.get(2)
        let jim = await store.get(3)
        let susan = await store.get(4)


        //Assert
        assert.equal(pat.name, "Pat")
        assert.equal(bill.name, "Bill")
        assert.equal(jim.name, "Jim")
        assert.equal(susan.name, "Susan")


    })


    it('should put many items and read', async () => {

        for (let i=0; i< 1000; i++) {
            console.log(`putting ${i}`)
            await store.put(i, {
                id: i,
                name: `Pat${i}`
            })
        }

        //Act
        for (let i=0; i< 1000; i++) {
            console.log(`getting ${i}`)

            let value = await store.get(i)
            assert.equal(value.name, `Pat${i}`)
        }


    })

})