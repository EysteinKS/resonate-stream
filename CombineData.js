const stream = require("stream")
let Transform = stream.Transform

module.exports = class CombineData extends Transform {
  constructor(){
    super()
    this.totalStreamed = null
    this.combinedData = null
    console.time("CombineData")
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
    if(!this.combinedData){
      this.combinedData = chunk
    } else {
      this.combinedData = this.concatBuffers(this.combinedData, chunk)
    }
    cb()
  }

  _final(cb){
    console.log("Combine data buffer length: ", this.combinedData.buffer.length)
    this.push(this.combinedData)
    console.timeEnd("CombineData")
    cb()
  }
}