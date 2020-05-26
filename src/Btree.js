const btree = require("btreejs")
// const btree = require('merkle-btree')

const Tree = btree.create(2, btree.numcmp)

class BTree {

    constructor() {
        this.tree = new Tree()
    }

    get(key) {
        return this.tree.get(key)
    }

    put(key, value) {
        this.tree.put(key, value)
    }

    del(key) {
        this.tree.del(key)
    }

    count(minKey, maxKey) {
        return this.tree.count(minKey, maxKey)
    }

    


}

module.exports = BTree