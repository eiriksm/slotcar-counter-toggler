'use strict';
var five = require('johnny-five');
var board = new five.Board({
  repl: false
});
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

function logger() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(new Date());
  console.log.apply(console, args);
}

app.get('/', function(req, res){
  res.sendfile('index.html');
});

function init(relay) {
  io.on('connection', function(socket) {
    logger('Client connected');
    socket.on('disconnect', function(){
      logger('Client disconnected');
    });
    socket.on('start', function(msg){
      logger('Start received');
      setTimeout(function() {
        relay.toggle();
        socket.emit('started');
      }, 3000);
    });
    socket.on('stop', function() {
      relay.toggle();
      socket.emit('end');
    });
  });

  http.listen(3000, function(){
    logger('listening on *:3000');
  });
}

board.on('ready', function() {
  var relay = new five.Relay(10);
  logger('Board ready');
  init(relay);
});
