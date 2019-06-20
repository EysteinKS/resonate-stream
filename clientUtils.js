function emitToClient(event, content, clientSocket) {
  if (clientSocket) {
    console.log(`Emitting ${event} to client`);
    clientSocket.emit(event, content);
  }
}

module.exports = {
  emitToClient
}