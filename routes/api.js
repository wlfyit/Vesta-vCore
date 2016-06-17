var express = require('express');
var router  = express.Router();


module.exports = function (auth, voice, weather, logger) {

  // Users API
  router.get('/users/:user_id', function (req, res) {
    auth.routeGetUser(req.params.user_id, req, res);
  });

  // Voice API
  router.get('/voice/phrases/:vhash', voice.routeGetPhrase);
  router.get('/voice/phrases/:vhash/file', voice.routeGetPhraseFile);
  router.post('/voice/say', voice.routeSay);

  // Weather API
  router.get('/weather/:datatype', weather.routeGet);

  return router;
};


