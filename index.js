const Discord = require("discord.js");
const http = require("http");
const express = require("express");
const app = express();
const server = http.createServer(app);
const io = require("socket.io").listen(server);
const ss = require("socket.io-stream");
const mm = require("music-metadata");
const fs = require("fs");
const prism = require("prism-media");
const { token, yt_api } = require("./config");
const request = require("request");

const ytdl = require("ytdl-core");
const getYoutubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");

const ConcatData = require("./ConcatData")
const CombineData = require("./CombineData")
const { emitToClient } = require("./clientUtils")

const PREFIX = "?";

const client = new Discord.Client();
client.login(token);
const stream = ss.createStream();

//AUDIO EDITING
let queue = [];
let optionsQueue = [];
let actions = [];
let clientSocket = null;

let isPlaying = false;
let dispatcher = null;
let voiceChannel = null;
let textChannel = null;

let serverSettings = {
  socketStream: {
    highWaterMark: 15360,
    allowHalfOpen: true,
    objectMode: false
  },
  decoder: {
    returnDemuxed: false
  },
  opus: {
    frameSize: 960,
    channels: 2,
    rate: 48000
  },
  audioStream: {
    log: {
      active: false,
      formatsToLog: false
    },
    tryToWriteFile: false,
    tryToReadFile: false,
    tryToDecodeOpus: {
      active: true,
      playDecoded: false,
      createConcatData: false,
      sendAsStream: false,
      sendAsFile: true
    },
    playAudioStream: true
  }
}

client.on("ready", () => {
  console.log("HarmonyBot is Online!");
});

client.on("error", err => {
  console.warn(err);
});

io.on("connection", socket => {
  if (!clientSocket) {
    console.log("User connected!");
    console.log("Setting clientSocket to current socket");
    clientSocket = socket;
    clientSocket.emit("isConnected", "You are connected!");
  }
  socket.on("completeHandshake", msg => console.log(msg));
  socket.on("tryDisconnect", msg => console.log(msg));
  socket.on("disconnect", () => {
    clientSocket = null;
    console.log("Client disconnected");
  });
});

const commandForName = {};
commandForName["play"] = {
  execute: (msg, args) => {
    console.log("Trying to play " + args);
    return msg.channel.createMessage("Missing command to play songs :(");
  }
};

client.on("message", handleMessage.bind(this));

function handleMessage(message) {
  if (!message.content.startsWith(PREFIX)) return;
  let command = message.content.slice(1).split(" ");
  let options = {};
  actions = [];
  console.log(command.length);
  if (command.length > 1) {
    let withoutCommand = [...command];
    withoutCommand.splice(0, 1);
    console.log("withoutCommand: ", withoutCommand);
    withoutCommand.forEach((val, index) => {
      switch (val[0]) {
        case "$":
          //Set start time of stream
          console.log(
            "Found value with $, adding begin as option. Found at index: ",
            index
          );
          options.begin = val.slice(1);
          console.log("command before splice: ", command);
          actions.push(command[index + 1]);
          console.log("command after splice : ", command);
          break;
        default:
          break;
      }
    });
  }
  const mainCommand = command[0].toLowerCase();
  actions.push(mainCommand);
  console.log("Command: ", command);
  console.log("mainCommand: ", mainCommand);
  switch (mainCommand) {
    case "+":
    case "play":
      textChannel = message.channel;
      commandPlay(message.member, message.content, options);
      break;
    case "?":
    case "help":
      textChannel = message.channel;
      commandHelp(message.member, message);
      break;
    case "!":
    case "hey":
      //Check current state, switch between invite to channel, play
      if (!voiceChannel) return message.reply("Howdy!");
      if (isPlaying) {
        message.reply("Pausing!");
        commandPause();
      } else {
        message.reply("Resuming!");
        commandResume();
      }
      break;
    case "x":
    case "skip":
      //Skip to next song
      commandSkip();
      break;
    case "*":
    case "queue":
      //Show queue in text channel
      message.reply("Oh sorry, I wasn't paying attention");
      break;
    case "_":
    case "song":
      //Show current song metadata
      message.reply("¯\\_(ツ)_/¯ ");
      break;
    case "-":
    case "dev":
      commandDev()
      break
    default:
      console.log(command);
      message.reply(
        " command not recognized! Type '?help' or '??' for a list of commands."
      );
      break;
  }
}

const modes = {
  default: {

  },

}

function commandDev(member, message) {
  let args = msg
    .split(" ")
    .filter(arg => !actions.includes(arg))
    .slice(1)
  switch(args[0]){
    case "modes":
      break
    case "mode":
      break
    case "restart":
      break
    default:
      break
  }
}

const help = [
  `
Every command to HarmonyBot must start with a question mark (?)  followed by a command
`,
  `
Send '?!' or '?hey' to either invite HarmonyBot to voice channel, or switch between playing or pausing the current song.`,
  `
Send '?play ' or '?+ ' to queue a song based on a YouTube ?v= or any query.
Add starting time as an option by typing '$' after the query followed by formats such as:
    0ms, 0s, 0m, 0h, 1:30, 05:10.123 or 10m30s. 
    Example: ?+ a long movie $1h20m`,
  `
Send '?_' or 'song' to display information about the current song`,
  `
Send '?x' or '?skip' to skip the current song.`,
  `
Send '?*' or '?queue' to see current queue`
];

function commandHelp(member, msg) {
  if (!member.voiceChannel) {
    return;
  }
  if (!voiceChannel) voiceChannel = member.voiceChannel;
  msg.reply(help.join(""));
}

function commandPlay(member, msg, options) {
  if (!member.voiceChannel) {
    return;
  }
  if (!voiceChannel) {
    voiceChannel = member.voiceChannel;
  }
  let args = msg
    .split(" ")
    .filter(arg => !actions.includes(arg))
    .slice(1)
    .join(" ");

  //To use with youtube video links
  if (Array.isArray(args) && args.length > 1) {
    console.log("args.length > 1: ", args.length > 1);
    args = args.toLowerCase();
  }

  console.log("Args after filter: ", args);
  args = reduceTrailingWhitespace(args);
  if (args.length != 0) playRequest(args, options);
}

function playRequest(args, options) {
  if (queue.length > 0 || isPlaying) {
    textChannel.send(`Trying to play ${args}`);
    getID(args, function(id) {
      if (id == null) {
        textChannel.send("Sorry, no search results turned up");
      } else {
        add_to_queue(id, options);
        fetchVideoInfo(id, function(err, videoInfo) {
          if (err) throw new Error(err);
          textChannel.send("Added to queue **" + videoInfo.title + "**");
        });
      }
    });
  } else {
    getID(args, function(id) {
      if (id == null) {
        textChannel.send("Sorry, no search results turned up");
      } else {
        isPlaying = true;
        queue.push("placeholder");
        console.log("Playing ", id);
        playMusic(id, options);
      }
    });
  }
}

function streamAudioToClient(stream, socket, optionalData) {
  let streamSettings = serverSettings.socketStream
  let clientStream = ss.createStream({ 
    highWaterMark: streamSettings.highWaterMark, 
    allowHalfOpen: streamSettings.allowHalfOpen,
    objectMode:  streamSettings.objectMode })
  console.log("Found client, sending stream over socket.io");
  let options = null
  if(optionalData){
    options = optionalData
  }
  ss(socket).emit("track-stream", clientStream, options)
  let ytdlDataChecked = 0
  stream.on("data", data => {
    if(ytdlDataChecked < 3){
      clientSocket.emit("ytdl-data", data);
      ytdlDataChecked++
    }
  })
  stream.pipe(clientStream);
    ss(socket).on("returnStream", returnStream => {
    console.log(returnStream);
    console.log(typeof returnStream);
    console.log("Client returning stream");
    returnStream.pipe(stream);
    console.log("Error in returnStream!");
  })
}

function encodeOpus(input){
  let opusSettings = serverSettings.opus
  const encoder = new prism.opus.Encoder({ 
    frameSize: opusSettings.frameSize, 
    channels: opusSettings.channels, 
    rate: opusSettings.rate })
  let encoderDataChecked = 0
  encoder.on("progress", (length, downloaded, totalLength) => {
    console.log(`Encoder progress: ${length} => ${downloaded}/${totalLength}`)
  })
  encoder.on("data", data => {
    if(encoderDataChecked < 3){
      //console.log("Data from encoder: ", data.buffer)
      if(clientSocket)clientSocket.emit("encoder-data", data)
      encoderDataChecked++
    }
  })
}

async function decodeOpusFromWebm(input, returnDemuxed = false){
  let opusSettings = serverSettings.opus
  const opusDecoder = new prism.opus.Decoder({ 
    frameSize: opusSettings.frameSize, 
    channels: opusSettings.channels, 
    rate: opusSettings.rate })
  const webmDemuxer = new prism.opus.WebmDemuxer()

  let inputDataChecked = 0
  input.on("data", data => {
    if(inputDataChecked < 3){
      //console.log("Data input in decodeOpusFromWebm: ", data)
      inputDataChecked++
    }
  })

  let demuxed = input.pipe(webmDemuxer)
  let demuxedDataChecked = 0
  demuxed.on("data", data => {
    if(demuxedDataChecked < 3){
      //console.log("Data from demuxed: ", data)
      demuxedDataChecked++
    }
  })
  if(returnDemuxed){ return demuxed }

  let decoded = demuxed.pipe(opusDecoder)
  let opusDataChecked = 0
  decoded.once("progress", (len, prog, total) => {
    console.log(`Decoded ${len} => ${prog}/${total}`)
  })
  decoded.on("data", data => {
    if(opusDataChecked < 3){
      //console.log("Data from decoded: ", data.buffer);
      opusDataChecked++
    }
  })
  decoded.on("error", err => console.error("Error on sendToOpusDecoder: ", err))
  return decoded
}

function playMusic(id, options) {
  let youtubeUrl = "https://www.youtube.com/watch?v=" + id;
  /* let youtubeOptions = {
    filter: format => {
      return format.container === "webm" && !format.encoding;
    }
  }; */
  //let youtubeOptions = {filter: (format) => format.audioEncoding === "vorbis"}
  let youtubeOptions = {};
  //let youtubeOptions = { format: "250", filter: "audioonly" }
  if (queue[0] === "placeholder") {
    youtubeOptions = options;
  } else {
    youtubeOptions = optionsQueue.shift();
  }
  console.log("youtubeOptions: ", youtubeOptions);
  voiceChannel
    .join()
    .then(async connection => {
      let startTime = new Date()
      //ytdl directly to connection
      /* connection.playStream(
        ytdl(youtubeUrl, {
          ...youtubeOptions,
          filter: "audioonly"
        })
      ); */

      let audioStream = ytdl(youtubeUrl, {
        ...youtubeOptions,
        filter: "audioonly"
      });
      /* let audioStream = ytdl(youtubeUrl, youtubeOptions) */

      const audioStreamLog = serverSettings.audioStream.log.active
      if (audioStreamLog) {

        let streamLength = null;
        const { getStreamLength } = require("./streamLogs")
        getStreamLength(audioStream, len => {
          streamLength = len
          emitToClient("total-length", len)
        })

        audioStream.on("progress", (length, downloaded, totalLength) => {
          console.log(
            `audioStream progress: ${length} => ${downloaded}/${totalLength}`
          );
        });

        const formatsToLog = serverSettings.audioStream.log.formatsToLog
        if(formatsToLog){
          const {formatInfo} = require("./streamLogs")
          formatInfo(audioStream)
        }
      }

      const tryToWriteFile = serverSettings.audioStream.tryToWriteFile;
      if (tryToWriteFile) {
        console.log("Trying to save stream as saved_audio.opus");
        const writeStream = fs.createWriteStream("saved_audio.opus");
        audioStream.pipe(writeStream);
        writeStream.on("pipe", () =>
          console.log("audioStream is piped to writeStream")
        );
        writeStream.on("error", err =>
          console.warn("Error when writing file: ", err)
        );
        writeStream.on("finish", () =>
          console.log("Finished saving saved_audio.opus")
        );
      }

      const tryToReadFile = serverSettings.audioStream.tryToReadFile;
      const sendToFFmpegDecoder = false;
      const pipeFFmpegToOpus = false;
      const sendToOpusDecoder = false;
      const sendToDiscord = false;

      if (tryToReadFile) {
        console.log("Trying to read stream from saved_audio.opus");
        const readStream = fs.createReadStream("saved_audio.opus");
        readStream.on("open", async () => {
          console.log("readStream is open");
          if (sendToFFmpegDecoder) {
            try {
              const transcoder = new prism.FFmpeg();
              const transcoded = readStream.pipe(transcoder);
              if (pipeFFmpegToOpus) {
                let FFmpegToOpus = transcoded.pipe(
                  new prism.opus.Encoder({
                    rate: 48000,
                    channels: 2,
                    frameSize: 960
                  })
                );
                dispatcher = connection.playStream(FFmpegToOpus);
              } else {
                dispatcher = connection.playStream(transcoded);
              }
            } catch (err) {
              console.log("Error on sendToDecoder: ", err);
            }
          } else if (sendToOpusDecoder) {
            const opusDecoder = decodeOpusFromWebm(readStream)
            const opusEncoder = new prism.opus.Encoder({frameSize: 960, channels: 2, rate: 48000})
            opusDecoder.pipe(opusEncoder)
            dispatcher = connection.playStream(audioStream);
          } else if (sendToDiscord) {
            dispatcher = connection.playStream(readStream)
          }
        });
      }

      //Try to decode through prism-media
      const tryToDecodeOpus = serverSettings.audioStream.tryToDecodeOpus;
      const playDecoded = serverSettings.audioStream.playDecoded
      if (tryToDecodeOpus) {
        //let decoded = false
        let decoded = await decodeOpusFromWebm(audioStream, "decoded")
        /* try {
          decoded = await decodeOpusFromWebm(audioStream, "decoded")
        } catch(err) { console.log("Error on decoding opus: ", err) } */

        let newConcatData = false
        let createConcatData = false
        if(decoded && createConcatData){
          try {
            newConcatData = new ConcatData(8)
            decoded.pipe(newConcatData)
            if(playDecoded){
              console.log("Dispatching decoded to connection")
              dispatcher = connection.playConvertedStream(decoded)
            }
            newConcatData.on("end", () => {
              console.log("newConcatData ended!")
            })
          } catch(err) { console.log("Error on decoding opus: ", err) }
        }

        const sendAsStream = false
        if(clientSocket && sendAsStream && newConcatData){
          try {
            console.log("Sending data to client")
            let endTime = new Date()
            let timeDiff = endTime - startTime
            console.log(`Time elapsed processing on server is ${timeDiff}ms`)
            clientSocket.emit("time-elapsed", timeDiff)
            streamAudioToClient(newConcatData, clientSocket) 
            dispatcher = connection.playConvertedStream(newConcatData)  
          } catch(err) { console.log("Error sending concatData stream: ", err)}
        }

        const sendAsFile = true
        if(sendAsFile && decoded){
          try {
          console.time("createWriteStream")
          const writeStream = fs.createWriteStream("temp.opus");
          decoded.pipe(writeStream)
          writeStream.on("finish", () => {
            console.timeEnd("createWriteStream")
            console.time("createReadStream")
            const stat = fs.statSync("temp.opus")
            console.log("size of temp.opus: ", stat.size)
            const readStream = fs.createReadStream("temp.opus")
            console.timeEnd("createReadStream")
            streamAudioToClient(readStream, clientSocket, { stat })
          })
          } catch(err) {console.log("Error in sendAsFile: ", err)}
        }

        const sendAsCombined = false
        if(sendAsCombined && decoded){
          try {
            const combinedData = new CombineData()
            decoded.pipe(combinedData)
            combinedData.on("finish", () => {
              console.log("combinedData keys: ", Object.keys(combinedData))
              emitToClient("total-length", combinedData.length)
              console.log("combinedData ended")
              if(clientSocket){
                console.log("Sending data to client")
                let endTime = new Date()
                let timeDiff = endTime - startTime
                console.log(`Time elapsed processing on server is ${timeDiff}ms`)
                clientSocket.emit("time-elapsed", timeDiff)
                let sendCombinedStream = true
                if(sendCombinedStream){
                  streamAudioToClient(combinedData, clientSocket)
                } else {
                  clientSocket.emit("combined-data", combinedData)
                }
              }
            })} catch(err) { console.log("Error on sending combined data: ", err) }
        }
      }

      const tryToDecodeVorbis = false;
      if (tryToDecodeVorbis) {
        const vorbisDecoder = new prism.vorbis.WebmDemuxer();
        audioStream.pipe(vorbisDecoder);
        vorbisDecoder.on("data", data => {
          //console.log("Data from vorbisDecoder: ", data);
        });
      }

      //audioStream.pipe(stream)

      //Send stream to client over socket.io-stream
      /* if (clientSocket) {
        streamAudioToClient(audioStream, clientSocket)

      } else {
        console.log("No client found, playing audio straight to dispatcher");
      } */

      const playAudioStream = serverSettings.audioStream.playAudioStream
      if (playAudioStream) {
        console.log("Dispatching audioStream to connection")
        dispatcher = connection.playStream(audioStream);
      }
      if(dispatcher) {
      console.log("Dispatching to connection.playStream ");
      fetchVideoInfo(id, function(err, videoInfo) {
        if (err) throw new Error("Error at fetchVideoInfo: ", err);
        textChannel.send("Now playing **" + videoInfo.title + "**");
      });
      dispatcher.on("end", function() {
        textChannel.send(`Song ended`);
        dispatcher = null;
        queue.shift();
        console.log("queue size: " + queue.length);
        if (queue.length === 0) {
          textChannel.send("Nothing queued!");
          console.log("Stream ended");
          queue = [];
          isPlaying = false;
          voiceChannel.leave();
          if(clientSocket){

          }
        } else {
          setTimeout(function() {
            playMusic(queue[0]);
          }, 2000);
        }
      });
      }

      skipReq = 0;
      skippers = [];
    })
    .catch(err => console.log("Error in voice channel! ", err));
}

function isYoutube(str) {
  return str.toLowerCase().indexOf("youtube.com") > -1
}

function isYoutubeID(str) {
  return str.length === 11
}

function getID(str, cb) {
  if (isYoutube(str)) {
    cb(getYoutubeID(str));
  } else if (isYoutubeID(str)){
    console.log("str is youtube id: ", str)
    cb(str)
  } else {
    search_video(str, function(id) {
      cb(id);
    });
  }
}

function add_to_queue(strID) {
  if (isYoutube(strID)) {
    queue.push(getYoutubeID(strID));
  } else {
    queue.push(strID);
  }
}

function search_video(query, callback) {
  console.log("query in search_video: ", query);
  request(
    "https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" +
      encodeURIComponent(query) +
      "&key=" +
      yt_api,
    function(error, response, body) {
      if (error) {
        console.log("Error on request in search_video: ", error);
      }

      var json = JSON.parse(body);
      console.log("json: ", json);

      if (json.items[0] == null) {
        callback(null);
      } else {
        callback(json.items[0].id.videoId);
      }
    }
  );
}

function reduceTrailingWhitespace(string) {
  for (var i = string.length - 1; i >= 0; i--) {
    if (string.charAt(i) == " ") string = string.slice(0, i);
    else return string;
  }
  return string;
}
function skipSong() {
  if (dispatcher) {
    dispatcher.end();
  }
  if (stream) {
    stream.end();
  }
}

function commandSkip() {
  if (queue.length > 0) {
    skipSong();
    textChannel.send("Skipping current song!");
  }
}

function commandPause() {
  if (dispatcher) {
    dispatcher.pause();
  }
}

function commandResume() {
  if (dispatcher) {
    dispatcher.resume();
  }
}

server.listen("3002", () => {
  console.log("Server listening at port 3002");
});