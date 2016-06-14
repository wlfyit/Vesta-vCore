// Load required packages
var config        = require('../config');
var crypto        = require('crypto');
var BasicStrategy = require('passport-http').BasicStrategy;
var LocalStrategy = require('passport-local').Strategy;
var pg            = require('pg');

module.exports = function (db, passport, config, logger) {
  var AuthController = {};

  passport.serializeUser(function (user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function (id, done) {
    getUserQuery = 'SELECT * FROM public.users WHERE id = $1 LIMIT 1;';

    db.query(getUserQuery, [id], function (err, result) {
      var user = result.rows[0];

      delete user['password'];

      if (err) {
        return done(err);
      }
      else {
        return done(err, user);
      }
    });
  });

  function verifyUser(username, password, callback) {
    getUserQuery = 'SELECT * FROM public.users WHERE lower(username) = lower($1) LIMIT 1;';

    db.query(getUserQuery, [username], function (err, result) {
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
    failureRedirect: '/vesta/login',
    session: true
  });

  AuthController.isApiApp  = passport.authenticate('basic', {session: false});

  return AuthController;
};

