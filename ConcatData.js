const stream = require("stream")
let Transform = stream.Transform

module.exports = class ConcatData extends Transform {
  constructor(chunksToConcat = 2){
    super()
    if(chunksToConcat < 2){
      throw new Error("chunksToConcat needs to be 2 or more!")
    }
    this.chunksToConcat = chunksToConcat
    this.buffersToReturn = null
    this.chunks = []
    this.totalStreamed = 0
    console.time("ConcatData")
  }

  processChunks(fromFunction = "transform"){
    let toProcess
    if(fromFunction === "transform"){
      toProcess = this.chunksToConcat
    } else if (fromFunction === "final"){
      toProcess = this.chunks.length
    }
    for(let i = 0; i < toProcess; i++){
      if(!this.buffersToReturn){
        this.buffersToReturn = this.concatBuffers(this.chunks[i], this.chunks[i+1])
      } else {
        this.buffersToReturn = this.concatBuffers(this.buffersToReturn, this.chunks[i+1])
      }
    }
    console.log("Returning buffers")
    this.push(this.buffersToReturn)

    //Reset properties
    this.buffersToReturn = null
    this.chunks = []
  }

  concatBuffers(buf1, buf2){
    if(!buf1){
      return buf2
    } else if (!buf2){
      return buf1
    }
    //console.log(`concatBuffers with length ${buf1.buffer.byteLength} and ${buf2.buffer.byteLength}`)
    let tmp = new Uint8Array(buf1.buffer.byteLength + buf2.buffer.byteLength)
    tmp.set(new Uint8Array(buf1.buffer), 0)
    tmp.set(new Uint8Array(buf2.buffer), buf1.buffer.byteLength)
    //console.log("concated buffers, new length is: ", tmp.buffer.byteLength)
    this.totalStreamed += tmp.buffer.byteLength
    return tmp
  }

  _transform(chunk, enc, cb){
    this.chunks.push(chunk)
    //console.log(`Got ${this.chunks.length}/${this.chunksToConcat} chunks`)
    if(this.chunks.length === this.chunksToConcat){
      this.processChunks("transform")
      cb()
    } else {
      cb()
    }
  }
  _final(cb){
    if(this.chunks.length){
      console.log(`Returning ${this.chunks.length} chunks`)
      this.processChunks("final")
    } else {
      console.log("No chunks left!")
    }
    console.timeEnd("ConcatData")
    console.log("totalStreamed from ConcatData: ", this.totalStreamed)
    cb()
  }
}