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
  , _ = require('underscore')
  , request = require('request');

var port = process.env.PORT || 3000;
var googleCredentials = {};
var proxy;

// Configurações de Cookie e Session do Express
app.configure(function () {
  app.use(express.logger());
  app.set('view engine', 'ejs');
  app.use(cookie);
  app.use(session);
  app.use(express.static(__dirname + '/public'));
  googleCredentials.client_id = '971716775291-5u2igpq9var1nkq2ssutl2kk9thp25p0.apps.googleusercontent.com';
  googleCredentials.client_secret = 'alRwAgjQ6yKR-0F3e8sECt8L';
  googleCredentials.redirect_uri = 'http://localhost:3000/oauth2callback';
  proxy = 'http://proxy.ns2online.com.br:8080';
});
app.configure('production', function () {
  googleCredentials.client_id = '971716775291.apps.googleusercontent.com';
  googleCredentials.client_secret = 'xilkri5GtRzbQqaUl7aYoTRc';
  googleCredentials.redirect_uri = 'http://dummychat.herokuapp.com/oauth2callback';
  proxy = null;
});

app.get('/login/google/:room', function (req, res) {
  var nonce = Math.floor(Math.random() * 90000) + 10000;
  req.session.nonce = nonce;
  var urlObj = {
    protocol: 'https',
    host: 'accounts.google.com',
    pathname: '/o/oauth2/auth',
    query: {
      client_id: googleCredentials.client_id,
      response_type: 'code',
      //scope: 'openid email',
      //scope: 'https://www.googleapis.com/auth/plus.login',
      scope: 'https://www.googleapis.com/auth/plus.me',
      redirect_uri: googleCredentials.redirect_uri,
      state: nonce + '@' + req.params.room,
      prompt: 'select_account'
    }
  };
  res.redirect(url.format(urlObj));
});
app.get('/oauth2callback', function (req, res) {
  var urlObj = url.parse(req.url, true);
  var state = urlObj.query.state.split('@');
  if (req.session.nonce == state[0]) {
  	console.log('nonce ok.');
    delete req.session.nonce;
    var accessTokenObj = {
      url: 'https://accounts.google.com/o/oauth2/token',
      form: {
        code: urlObj.query.code,
        client_id: googleCredentials.client_id,
        client_secret: googleCredentials.client_secret ,
        redirect_uri: googleCredentials.redirect_uri,
        grant_type: 'authorization_code'
      }
    };
    if (proxy) {
      accessTokenObj.proxy = proxy;
    }
    console.log(JSON.stringify(accessTokenObj));
    request.post(accessTokenObj, function (error, response, body) {
      console.log('code error:' + error);
      console.log('code response:' + response);
      console.log('code body:' + body);
      var bodyObj = JSON.parse(body);
      var meObj = {
        url: 'https://www.googleapis.com/plus/v1/people/me',
        headers: { Authorization: 'Bearer ' + bodyObj.access_token }/*,  qs: { access_token: body.access_token }*/
      };
      if (proxy) {
        meObj.proxy = proxy;
      }
      //console.log(JSON.stringify(meObj));
      request.get(meObj,  function (error, response, body) {
        //console.log('people/me error:' + error);
        //console.log('people/me response:' + response);
        //console.log('people/me body:' + body);
        var bodyObj = JSON.parse(body);
        req.session.displayName = bodyObj.displayName;
        res.redirect('/chat/' + state[1]);
      });
    });
  } else {
    res.end(); // TODO: wrong nonce, send appropriate error code
  }
});
app.get('/chat/:room', function (req, res) {
  if (!req.session.displayName) {
    res.render('login', { room: req.params.room });
  } else {
    res.render('chat');
  }
});
server.listen(port, function () {
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
  var room = pathElements[0];
  var name = session.displayName;
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