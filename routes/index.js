var express = require('express');
var router = express.Router();

module.exports = function (passport, logger) {
  /* GET home page. */
  router.get('/', function(req, res, next) {
    res.render('index', {title: 'Vesta', user: req.user, navbar: req.navbar});
  });

  // login page
  router.get('/login', function (req, res, next) {
    res.render('login', {title: 'Vesta > Login', user: req.user, brand: 'Login', navbar: req.navbar});
  });
  router.post('/login',
    passport.authenticate('local', {
      successRedirect: '/vesta/',
      failureRedirect: '/vesta/login',
      failureFlash: true
    })
  );
  router.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/vesta');
  });

  return router;
};