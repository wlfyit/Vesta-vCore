// Load required packages
var crypto        = require('crypto');
var BasicStrategy = require('passport-http').BasicStrategy;
var LocalStrategy = require('passport-local').Strategy;

var sqlGetUserByID        = 'SELECT * FROM public.users WHERE id = $1 LIMIT 1;';
var sqlGetUserByUsername  = 'SELECT * FROM public.users WHERE lower(username) = lower($1) LIMIT 1;';
var sqlUpdateUserLastSeen = 'UPDATE public.users SET last_seen=now() WHERE id=$1;';

module.exports = function (db, passport, config, logger) {
  var AuthController = {};

  passport.serializeUser(function (user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function (id, done) {
    db.query(sqlGetUserByID, [id], function (err, result) {
      var user = result.rows[0];

      delete user['password'];

      if (err) {
        return done(err);
      }
      else {
        return done(null, user);
      }
    })
  });

  function updateLastSeen(id) {
    db.query(sqlUpdateUserLastSeen, [id], function (err, result) {
      if (err)
        return done(err);

      return logger.debug('Updated last seen for id [' + id + ']');
    })
  }

  function verifyUser(username, password, callback) {
    db.query(sqlGetUserByUsername, [username], function (err, result) {
      var passHash = crypto.createHmac('sha512', config.vesta.secret);
      passHash.update(password);

      if (err) {
        return callback(err);
      }
      else if (result.rowCount == 0) {
        return callback(null, false);
      }
      else if (result.rows[0].password == passHash.digest('hex')) {
        var user = result.rows[0];

        delete user['password'];
        updateLastSeen(user.id);
        return callback(null, user);
      }
      else {
        return callback(null, false);
      }
    });
  }

  passport.use(new BasicStrategy(verifyUser));
  passport.use(new LocalStrategy(verifyUser));

  AuthController.isAuthApp = passport.authenticate('local', {
    successReturnToOrRedirect: '/vesta/',
    failureRedirect          : '/vesta/login',
    session                  : true
  });

  AuthController.isApiApp = passport.authenticate('basic', {session: false});

  AuthController.routeGetUser = function (username, req, res) {
    db.query(sqlGetUserByUsername, [username], function (err, result) {
      if (err)
        res.send(err);

      var userObj = result.rows[0];
      delete userObj['password'];

      res.json(userObj);
    });
  };

  return AuthController;
};

