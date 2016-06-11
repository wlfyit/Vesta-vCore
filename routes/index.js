var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {title: 'Vesta', user: req.user, navbar: req.navbar});
});

module.exports = router;
