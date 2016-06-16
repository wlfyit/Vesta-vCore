var https = require('https');

module.exports = function (db, redis, ks, logger) {


  var WeatherController = {};

  function parseData(data) {

    console.log(data);
  }

  WeatherController._updateData = function () {
    ks.get('config:weather:apiKey', function (err, result) {
      var wuKey = result['config:weather:apiKey'];

      ks.get('config:weather:location', function (err, result) {
        var location = result['config:weather:location'];
        var wuURL    = 'https://api.wunderground.com/api/' + wuKey +
          '/alerts/astronomy/conditions/currenthurricane/forecast/webcams/q/' + location + '.json';

        logger.debug('trying url [' + wuURL + ']');

        https.get(wuURL, function (res) {
          var body = '';

          res.on('data', function (chunk) {
            body += chunk;
          });

          res.on('end', function () {
            var response = JSON.parse(body);
            logger.debug('');
            parseData(response)
          });
        }).on('error', function (e) {
          logger.error('could not retrieve weather data', e);
        });

      });
    });
  };

  return WeatherController;
};