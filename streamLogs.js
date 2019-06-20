function getStreamLength(stream, cb){
  stream.once(
    "progress",
    (length, downloaded, totalLength) => {
      console.log("progress totalLength: ", totalLength);
      cb(totalLength)
    }
  );
}

function formatInfo(stream){
  stream.on("info", (info, format) => {
    console.log("------");
    console.log("Current format itag: ", format.itag);
    console.log("Current format type: ", format.type);
    console.log(
      "Current format samplerate: ",
      format["audio_sample_rate"]
    );
    console.log(
      "Current format audioBitrate: ",
      format.audioBitrate
    );
    console.log("------");
    console.log(" ");
    console.log("Available audio formats:");
    let infoFormats = info.formats;
    for (let format in infoFormats) {
      if (!infoFormats[format].encoding) {
        console.log("------");
        console.log("Format itag: ", infoFormats[format].itag);
        console.log("Format type: ", infoFormats[format].type);
        console.log(
          "Format samplerate: ",
          infoFormats[format]["audio_sample_rate"]
        );
        console.log(
          "Format audioBitrate: ",
          infoFormats[format].audioBitrate
        );
        console.log("------");
      }
    }
  })
}

module.exports = {
  getStreamLength,
  formatInfo
}