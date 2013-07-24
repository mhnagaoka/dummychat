// app.js
const KEY = 'express.sid'
  , SECRET = 'express';

var url = require('url')
  , express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , cookie = express.cookieParser(SECRET)
  , store = new express.session.MemoryStore()
  , session = express.session({secret: SECRET
                             , key: KEY
                             , store: store})
  , _ = require('underscore');

var port = process.env.PORT || 3000;

// Configurações de Cookie e Session do Express
app.configure(function(){
  app.use(express.logger());
  app.set('view engine', 'ejs');
  app.use(cookie);
  app.use(session);
});

app.get('/chat/:room/:user', function(req, res){
  res.render('index');
});

server.listen(port, function(){
  console.log("Express e Socket.IO no ar. Porta " + port);
});

// Configurações do Socket.IO
io.set('authorization', function(data, accept) {
  cookie(data, {}, function(err) {
    if (!err) {
      var sessionID = data.signedCookies[KEY];
      store.get(sessionID, function(err, session) {
        if (err || !session) {
          accept(null, false);
        } else {
          data.session = session;
          accept(null, true);
        }
      });
    } else {
      accept(null, false);
    }
  });
});

io.sockets.on('connection', function (socket) {
  var session = socket.handshake.session;
  var referer = socket.handshake.headers.referer;
  var pathElements = url.parse(referer).pathname.split('/').reverse();
  var room = pathElements[1];
  var name = pathElements[0];
  socket.handshake.name = name;

  io.sockets.in(room).emit('announcement', { name: '', payload: name + ' entrou na sala' } );
  socket.join(room);
  refreshClientList(room);
  console.log(name + " connected and joined " + room);

  socket.on('toServer', function (msg) {
    msg.name = name;
    io.sockets.in(room).emit('toClient', msg);
  });

  socket.on('disconnect', function () {
    //refreshClientList(room, name);
    io.sockets.in(room).emit('announcement', { name: '', payload: name + ' saiu na sala' } );
    process.nextTick(function () {
      refreshClientList(room);
    });
    console.log(name + " disconnected");
  });
});

function refreshClientList(room) {
  io.sockets.in(room).emit('chatters', _.pluck(_.pluck(io.sockets.clients(room), 'handshake'), 'name'));
}