'use strict';
var path = require('path');
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var sp = new SerialPort('/dev/tty.usbmodem1411', {
  baudrate: 9600,
  parser: serialport.parsers.readline("\n")
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
  res.sendFile(path.join(__dirname, 'index.html'));
});

var name = 'player 1';

function init() {
  var startTime = null;
  var running = false;
  var totalSpeed = 0;
  function stopThisStuff() {
    if (!running) {
      return;
    }
    if (Date.now() < startTime + 2000) {
      return;
    }
    var score = Math.floor((Date.now() - startTime) + totalSpeed);
    totalSpeed = 0;
    logger('Stop received. Score:', score);
    io.emit('end', score);
    sp.write(new Buffer([0x01]));
    running = false;
  }
  
  io.on('connection', function(socket) {
    socket.emit('name', name);
    socket.currentScore = 0;
    logger('Client connected');
    socket.on('disconnect', function(){
      logger('Client disconnected');
    });
    socket.on('start', function() {
      logger('Start received');
      io.emit('countdown');
      setTimeout(function() {
        running = true;
        logger('Toggle power');
        startTime = Date.now()
        sp.write(new Buffer([0x01]));
        io.emit('started');
      }, 3000);
    });
    socket.on('stop', stopThisStuff);
    socket.on('name', function(d) {
      logger('New name', d);
      name = d;
    })
  });

  http.listen(3000, function(){
    logger('listening on *:3000');
  });
  sp.on('open', function () {
    logger('Serialport opened');
    var counter = 0;
    var valid = 0;
    var totalInterval = 0;
    sp.on('data', function(d) {
      counter++;
      var sendSpeed = false;
      var number = parseInt(d);
      var speed = 0;
      if (number > 600 || number < 50) {
        // Ignoring this. If we ignore 10 in a row, we will stop this thing.
      }
      else {
        totalInterval = totalInterval + number;
        valid++;
      }
      if (counter === 10) {
        speed = parseInt(totalInterval / valid, 10);
        sendSpeed = true;
        counter = 0;
        valid = 0;
        totalInterval = 0;
      }
      
      if (sendSpeed) {
        // Find out the speed. An average of the valid measures.        
        if (!speed) {
          stopThisStuff();
        }
        else {
          io.emit('speed', speed);
        }
      }
    });
  });
}
init();
