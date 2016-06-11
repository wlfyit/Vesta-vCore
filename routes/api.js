var express = require('express');
var router = express.Router();


module.exports = function (voice, logger) {

  router.post('/say', function (req, res, next) {
    if (req.body.text && req.body.destination) {
      voice.sayRemote(req.body.text, req.body.destination);
      res.send({"status":200});
    }

  });

  return router;
};


