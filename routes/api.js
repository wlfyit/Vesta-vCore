var express = require('express');
var router  = express.Router();


module.exports = function (auth, voice, logger) {

  // Voice API
  router.get('/voice/phrases/:vhash', voice.routeGetPhrase);
  router.get('/voice/phrases/:vhash/file', voice.routeGetPhraseFile);
  router.post('/voice/say', voice.routeSay);

  // Users API
  router.get('/users/:user_id', function (req, res) {
    auth.routeGetUser(req.params.user_id, req, res);
  });

  return router;
};


