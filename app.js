require('newrelic'); // Init New Relic

// Load Config
var config = require('./config');

// Validation
if (!config.vesta.hasOwnProperty('secret')) {
  console.error('you must provide a vesta secret');
  process.exit(1);
}

// Load Modules
var bodyParser     = require('body-parser'),
    cookieParser   = require('cookie-parser'),
    express        = require('express'),
    expressSession = require('express-session'),
    passport       = require('passport'),
    path           = require('path'),
    pg             = require('pg'),
    Redis          = require("redis"),
    RedisStore     = require('connect-redis')(expressSession),
    winston        = require('winston');

// init Logging
var logger = new (winston.Logger)({
  transports: [
    new (require("winston-postgresql").PostgreSQL)({
      "connString": config.pg,
      "tableName" : "winston_logs",
      "level"     : "debug"
    }),
    new (winston.transports.Console)({
      colorize: true,
      level   : 'debug'
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
});
redis.on('error', function (err) {
  logger.error(err);
});
redis.on('warning', function (err) {
  logger.warn(err);
});

if (config.redis.hasOwnProperty('pass')) {
  redis.auth(config.redis.pass, function (err) {
    logger.info('authenticated redis');
  });
}

// init Controllers
var ksController    = require('./controllers/ks')(db, redis, config, logger);
var voiceController = require('./controllers/voice')(db, ksController, config, logger);
var authController  = require('./controllers/auth')(db, passport, config, logger);

var routes = require('./routes/index')(passport, logger),
    users  = require('./routes/users')(authController, logger),
    api    = require('./routes/api')(authController, voiceController, logger);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// log access
app.use(function (req, res, next) {
  var clientip = req.ip;
  if (req.headers['x-forwarded-for']) {
    clientip = req.headers['x-forwarded-for'];
  }

  logger.info(clientip + ' ' + req.method + ' ' + req.url);
  next();
});

// uncomment after placing your favicon in /public
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

// Configuring Passport
app.use(expressSession({
  store : new RedisStore({
    client: redis,
    pass  : config.redis.pass
  }),
  secret: config.vesta.secret
}));
app.use(passport.initialize());
app.use(passport.session());


var router = express.Router();

// Navbar
router.use(function (req, res, next) {
  if (req.user) {
    req.navbar = [
      {text: 'Home', context: '/vesta'},
      {text: 'Users', context: '/vesta/users'},
      {text: 'TyrBot', context: '/vesta/tyrbot'},
      {text: 'Lights', context: '/vesta/lights'}
    ];
  }
  else {
    req.navbar = [
      {text: 'Home', context: '/vesta'}
    ];
  }
  next();
});

// Request Routing
router.use(express.static(path.join(__dirname, 'public')));
router.use('/', routes);
router.use('/api', api);
router.use('/users', users);

app.use('/vesta', router);

//redirect root requests to /vesta context
app.get('/', function (req, res, next) {
  res.redirect('/vesta/');
});

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
      error  : err,
      user   : req.user,
      brand  : 'Error',
      navbar : req.navbar
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error  : {},
    user   : req.user,
    brand  : 'Error',
    navbar : req.navbar
  });
});


module.exports = app;
