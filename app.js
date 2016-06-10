// Load Config
var config = require('./config');

// Load Modules
var bodyParser         = require('body-parser'),
    cookieParser       = require('cookie-parser'),
    express            = require('express'),
    LargeObjectManager = require('pg-large-object').LargeObjectManager,
    path               = require('path'),
    pg                 = require('pg'),
    Redis              = require("redis"),
    winston            = require('winston');

// init Logging
var logger = new (winston.Logger)({
  transports: [
    new (require("winston-postgresql").PostgreSQL)({
      "connString": config.pg,
      "tableName": "winston_logs",
      "level": "debug"
    }),
    new (winston.transports.Console)({
      colorize: true,
      level: 'debug'
    })
  ]
});

// init DB
var db = null;
function connectDB() {
  db = new pg.Client(config.pg);

  db.on('error', function (error) {
    logger.error(error);

    // Wait 5 seconds and reconnect
    setTimeout(connectDB, 5 * 1000);
  });
  db.on('notice', function (msg) {
    logger.info(msg);
  });

  logger.info('connecting to db');
  db.connect();
}
connectDB();

// init Redis
var redis = Redis.createClient(config.redis.options);

redis.on('connect', function (err) {
  logger.info('connected to redis');
  if (config.redis.hasOwnProperty("pass")) {
    logger.info('authenticating redis');
    redis.auth(config.redis.pass);
  }
});
redis.on('error', function (err) {
  logger.error(err);
});
redis.on('warning', function (err) {
  logger.warn(err);
});

// Load Internal Modules
var voice = require('./module/voice')(db, config.ivona, logger);

voice.say("hello");

var routes = require('./routes/index'),
    users  = require('./routes/users'),
    api    = require('./routes/api');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// log access
app.use(function (req, res, next) {
  clientip = req.ip;
  if (req.headers['x-forwarded-for']){
    clientip = req.headers['x-forwarded-for'];
  }

  logger.info(clientip + ' ' + req.method + ' ' + req.url);
  next();
});

// uncomment after placing your favicon in /public
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', routes);
app.use('/api', api);
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
