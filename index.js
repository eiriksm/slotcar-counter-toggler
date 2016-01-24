'use strict';
var path = require('path');
var fs = require('fs');
var ws = require('nodejs-websocket');

var scoreFile = path.join(__dirname, 'data', 'scores.txt');
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
// Used to determine if we are running a dry-run, so we don't actually use the
// serialport.
var pluggedIn = true;

var sp = new SerialPort('/dev/tty.usbmodem1411', {
  baudrate: 9600,
  parser: serialport.parsers.readline("\n")
}, pluggedIn);
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);


var name = 'player 1';
var laps = 0;
var maxLaps = 0;
var incrementLap = function() {
  logger('Dummy incrementLap');
}
var server = ws.createServer(function (conn) {
  logger('New connection on ws');

  conn.on('text', function (str) {
    incrementLap(str);
  });
  conn.on('error', function(e) {
    logger('Error', e);
  });

  // When the client closes the connection, notify us
  conn.on("close", function (code, reason) {
    logger('Connection closed')
  });
}).listen(3001);
server.on('error', function(e) {
  logger('Server error', e);
});

function writeSp() {
  if (pluggedIn) {
    sp.write(new Buffer([0x01]));
  }
}

function logger() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(new Date());
  console.log.apply(console, args);
}

app.get('/', function(req, res){
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});
app.get('/scores', function(req, res){
  res.sendFile(path.join(__dirname, 'static', 'scores.html'));
});

app.get('/highscores', function(req, res) {
  fs.readFile(scoreFile, 'utf8', function(err, data) {
    // Loop over it, and sort it.
    var sorted = data.split("\n")
      // Parse into json.
      .map(function(n) {
        try {
          return JSON.parse(n)
        }
        catch (e) {
          return undefined;
        }
      })
      // Filter out bad json.
      .filter(function(n) {
        if (n) return true;
        return false;
      })
      // Sort based on score.
      .sort(function(a, b) {
      if (a && b && a.score < b.score) {
        return 1;
      }
      if (a && b && a.score > b.score) {
        return -1;
      }
      return 0;
    });
    // Return json of sorted scores.
    res.json(sorted);
  })
});

app.get('/highscorestime', function(req, res) {
  fs.readFile(scoreFile, 'utf8', function(err, data) {
    // Loop over it, and sort it.
    var sorted = data.split("\n")
      // Parse into json.
      .map(function(n) {
        try {
          return JSON.parse(n)
        }
        catch (e) {
          return undefined;
        }
      })
      // Filter out bad json. And unfinished races.
      .filter(function(n) {
        if (n) {
          if (n.maxLaps > n.laps) {
            return false;
          }
          return true;
        }
        return false;
      })
      // Sort based on score.
      .sort(function(a, b) {
      if (a && b && a.totalTime > b.totalTime) {
        return 1;
      }
      if (a && b && a.totalTime < b.totalTime) {
        return -1;
      }
      return 0;
    });
    // Return json of sorted scores.
    res.json(sorted);
  })
})

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
    // Store the score.
    fs.appendFile(scoreFile, JSON.stringify({
      name: name,
      laps: laps,
      score: score,
      endTime: Date.now(),
      startTime: startTime,
      totalTime: Date.now() - startTime,
      laps: laps,
      maxLaps: maxLaps
    }) + "\n");
    writeSp()
    running = false;
    laps = 0;
  }

  io.on('connection', function(socket) {
    socket.emit('name', name);
    socket.emit('lapsupdate', maxLaps);
    socket.currentScore = 0;
    logger('Client connected');
    socket.on('disconnect', function(){
      logger('Client disconnected');
    });
    socket.on('lapsupdate', function(number) {
      if (parseInt(number)) {
        logger('maxLaps is now ' + number);
        maxLaps = parseInt(number);
      };
    });
    incrementLap = function(number) {
      laps++;
      logger('Lap increment. Now at ' + laps);
      if (laps >= maxLaps) {
        logger('Probably reached goal');
        stopThisStuff();
      }
    };
    socket.on('start', function() {
      logger('Start received');
      io.emit('countdown');
      setTimeout(function() {
        laps = 0;
        running = true;
        logger('Toggle power');
        startTime = Date.now()
        writeSp();
        io.emit('started');
      }, 3000);
    });
    socket.on('stop', stopThisStuff);
    socket.on('name', function(d) {
      logger('New name', d);
      name = d;
      io.emit('name', name);
    });
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
          totalSpeed += speed;
        }
      }
    });
  });
}
init();
