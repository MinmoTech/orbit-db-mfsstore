const IPFS = require('ipfs')


class TestIpfs {

    static async get() {
    
        return IPFS.create({
            repo: './test/test-repos/' + Math.random().toString()
    
        })
    }
}



module.exports = TestIpfs