var express = require('express');
var router = express.Router();

module.exports = function (auth, logger) {

  router.get('/:user_id', function (req, res) {
    auth.routeGetUser(req.params.user_id , req, res);
  });

  return router;
};
