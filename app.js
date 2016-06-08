// Load Config
var config = require('./config');

// Load Modules
var bodyParser   = require('body-parser'),
    cookieParser = require('cookie-parser'),
    express      = require('express'),
    favicon      = require('serve-favicon'),
    logger       = require('morgan'),
    path         = require('path'),
    Redis        = require("redis"),
    winston      = require('winston');

var routes = require('./routes/index'),
    users  = require('./routes/users');

var app = express();

// init Logging
var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: true,
      level: 'debug'
    })
  ]
});

logger.add("PostgreSQL", {
  "connString": "user:pw@localhost:5432/db",
  "level": "debug"
});

// init Redis
var redis = Redis.createClient(config.redis.options);
if (config.redis.hasOwnProperty("pass")) {
  redis.auth(config.redis.pass);
}

redis.on('error', function (err) {
  console.log(err);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err    = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
