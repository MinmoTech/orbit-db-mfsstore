// @ts-nocheck
const MfsStore = require('../src/MfsStore')

var assert = require('assert')

const OrbitDB = require('orbit-db')

var TestIpfs = require('./ipfs')


describe('MfsStore', async () => {

    let store
    let ipfs 
    let orbitdb

    before('Setup', async () => {

        OrbitDB.addDatabaseType("mfsstore", MfsStore)

        ipfs = await TestIpfs.get()

        orbitdb = await OrbitDB.createInstance(ipfs)
        store = await orbitdb.open("testtable", {
            create: true, 
            type: "mfsstore",
            options: {
                schema: {
                    name: { unique: false },
                    currentTeam: { unique: false },
                    battingHand: { unique: false },
                    throwingHand: { unique: false }
                }
            }            
        })

        await store.load()
    })

    after('Teardown', async () => {
        ipfs.stop()
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

        //Check the count
        count = await store.count()
        assert.equal(count, 4)


    })


    it('should put many items and read', async () => {

        console.time('Putting 25 records in mfsstore')
        for (let i=0; i< 25; i++) {
            await store.put(i, {
                id: i,
                name: `Pat${i}`
            })
        }
        console.timeEnd('Putting 25 records in mfsstore')

        //Check the count
        let count = await store.count()
        assert.equal(count, 25)


        //Act
        console.time('Reading 25 records mfsstore')
        for (let i=0; i< 25; i++) {
            let value = await store.get(i)
            assert.equal(value.name, `Pat${i}`)
        }
        console.timeEnd('Reading 25 records mfsstore')


        count = await store.count()
        assert.equal(count, 25)

    })





    it('should retreive values by secondary indexes', async () => {

        //Arrange 
        await store.put(101, {
            id: 101,
            name: "Andrew McCutchen",
            currentTeam: "PIT",
            battingHand: "R",
            throwingHand: "R"
        })

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

    
        //Act
        let teamPIT = await store.getByIndex("currentTeam", "PIT", "desc", 0, 100)
        let teamBAL = await store.getByIndex("currentTeam", "BAL", "desc", 0, 100)

        let battingR = await store.getByIndex("battingHand", "R", "desc", 0, 100)
        let battingL = await store.getByIndex("battingHand", "L","desc", 0, 100)

        let throwingR = await store.getByIndex("throwingHand", "R", "desc", 0, 100)

        //Teams
        assert.equal(teamPIT[0].name, "Andrew McCutchen")
        assert.equal(teamPIT[1].name, "Jordy Mercer")

        assert.equal(teamBAL[0].name, "Pedro Alvarez")
        assert.equal(teamBAL[1].name, "Doug Drabek")

        //Batting
        assert.equal(battingR[0].name, "Andrew McCutchen")
        assert.equal(battingR[1].name, "Pedro Alvarez")
        
        assert.equal(battingL[0].name, "Jordy Mercer")
        assert.equal(battingL[1].name, "Doug Drabek")

        //Pitching
        assert.equal(throwingR[0].name, "Andrew McCutchen")
        assert.equal(throwingR[1].name, "Pedro Alvarez")
        assert.equal(throwingR[2].name, "Jordy Mercer")
        assert.equal(throwingR[3].name, "Doug Drabek")


    })


    it('should update a row from one secondary index to another', async () => {
        
        //Act
        await store.put(101, {
            id: 101,
            name: "Andrew McCutchen",
            currentTeam: "PIT",
            battingHand: "L", //was R
            throwingHand: "R"
        })


        //Assert
        let battingR = await store.getByIndex("battingHand", "R", "desc", 0, 100)
        let battingL = await store.getByIndex("battingHand", "L", "desc", 0, 100)



        assert.equal(battingR.length, 1)
        assert.equal(battingR[0].id != 101, true)

        assert.equal(battingL[0].id, 101)

    })

    it('should delete a row and remove it from all secondary indexes', async () => {

        //Act
        await store.del(103)


        //Assert
        let jordy = await store.get(103)
        let teamPIT = await store.getByIndex("currentTeam", "PIT", "desc", 0, 100)
        let battingL = await store.getByIndex("battingHand", "L", "desc", 0, 100)
        let throwingR = await store.getByIndex("throwingHand", "R", "desc", 0, 100)


        assert.equal(jordy, undefined)
        assert.equal(teamPIT.filter(player => player.id == 103).length, 0)
        assert.equal(battingL.filter(player => player.id == 103).length, 0)
        assert.equal(throwingR.filter(player => player.id == 103).length, 0)


    })

    it('should close and reload', async () => {

        //Reload
        console.time('Reload mfsstore')
        await store.close()
        await store.load()
        console.timeEnd('Reload mfsstore')

        let all = await store.list()
        let battingL = await store.getByIndex("battingHand", "L", "desc", 0, 100)

        assert.equal(all.length, 28)

        assert.equal(battingL[0].name, "Andrew McCutchen")
        assert.equal(battingL[1].name, "Doug Drabek")

    })



})