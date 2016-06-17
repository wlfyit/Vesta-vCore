var https = require('https');

var freshnessCheckInterval = 300; // 3 minutes in seconds
var freshnessAge           = 3600; // 1 hour in seconds
var cacheExpiration        = 21600; // 6 hours in seconds

module.exports = function (db, redis, ks, logger) {

  var redisPrefix       = 'weather:';
  var WeatherController = {};

  function parseData(data) {
    redis.setex(redisPrefix + 'lastresponse', cacheExpiration, data, function (err, result) {
      logger.debug('set key [' + redisPrefix + 'lastresponse] in redis');
    });

    var weatherData = null;
    try {
      weatherData = JSON.parse(data);
    }
    catch (e) {
      logger.error('weather JSON packet [' + data + '] is malformed')
    }
    finally {
      if (weatherData !== null) {
        var keys = Object.keys(weatherData);
        keys.forEach(function (element, index, array) {
          var value = JSON.stringify(weatherData[element]);
          redis.setex(redisPrefix + element, cacheExpiration, value, function (err, result) {
            logger.debug('set key [' + redisPrefix + element + '] in redis');
          });
        });
      }
    }
  }

  WeatherController._updateData = function () {
    ks.get('config:weather:apiKey', function (err, result) {
      var wuKey = result['config:weather:apiKey'];

      ks.get('config:weather:location', function (err, result) {
        var location = result['config:weather:location'];
        var wuURL    = 'https://api.wunderground.com/api/' + wuKey +
          '/alerts/astronomy/conditions/currenthurricane/forecast10day/hourly10day/satellite/webcams/q/' +
          location + '.json';

        logger.debug('trying url [' + wuURL + ']');

        https.get(wuURL, function (res) {
          var body = '';

          res.on('data', function (chunk) {
            body += chunk;
          });

          res.on('end', function () {
            parseData(body)
          });
        }).on('error', function (e) {
          logger.error('could not retrieve weather data', e);
        });

      });
    });
  };

  WeatherController._checkFreshness = function () {
    redis.get(redisPrefix + 'current_observation', function (err, result) {
      if (result === null) {
        logger.debug('no current weather data. refreshing');
        WeatherController._updateData();
      }
      else {
        logger.debug('checking weather data freshness');
        var weatherData = JSON.parse(result);
        var d           = new Date();
        var seconds     = Math.round(d.getTime() / 1000);

        // get
        if (Math.round(weatherData.local_epoch) + freshnessAge > seconds) {
          logger.debug('weather data is fresh');
        }
        else {
          logger.debug('weather data is not fresh. refreshing');
          WeatherController._updateData();
        }
      }
    })
  };

  WeatherController.routeGet = function (req, res) {
    var datatype = req.params.datatype;
    if (datatype.match(/^(alerts|current_observation|currenthurricane|forecast|hourly_forecast|lastresponse|moon_phase|query_zone|response|satellite|sun_phase|webcams)$/g)) {
      redis.get(redisPrefix + datatype, function (err, result) {
        if (result !== null) {
          res.send(JSON.parse(result));
        } else {
          res.status(404);
          res.send({'status': 404, 'error': 'Weather data not found.'});
        }
      });
    }
    else {
      res.status(400);
      res.send({'status': 400, 'error': 'Unkown weather data type.'});
    }
  };

  // Schedule Freshness Checks
  setImmediate(WeatherController._checkFreshness);
  setInterval(WeatherController._checkFreshness, freshnessCheckInterval * 1000);

  return WeatherController;
};