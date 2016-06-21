var hue = require("node-hue-api");

module.exports = function (redis, ks, logger) {
  var activeBridgeUpdateInterval = 5000,
      activeBridges              = {},
      cacheExpiration            = 3600, // 1 hour in seconds
      HueController              = {},
      ksPrefix                   = 'hue:',
      ksBridgePrefix             = 'bridge:',
      redisPrefix                = 'hue:';

  HueController._activateBridge = function (bridgeId) {
    if (!activeBridges.hasOwnProperty(bridgeId)) {
      ks.get(ksPrefix + ksBridgePrefix + bridgeId + ':username', function (err, result) {
        if (err)
          return logger.error(err);

        if (result !== 'NOTFOUND') {
          var username = result[ksPrefix + ksBridgePrefix + bridgeId + ':username'];

          ks.get(ksPrefix + ksBridgePrefix + bridgeId + ':meta', function (err, result) {
            if (err)
              return logger.error(err);

            var bridge              = JSON.parse(result[ksPrefix + ksBridgePrefix + bridgeId + ':meta']);
            activeBridges[bridgeId] = new hue.HueApi(bridge.ipaddress, username);
            HueController._getBridgeFullState(bridgeId);
          });
          logger.info('username found for bridge [' + bridgeId + ']');
        }
        else {
          logger.info('no username for bridge [' + bridgeId + ']');
        }
      })
    }
    else {
      logger.debug('bridge already activated')
    }
  };

  HueController._findBridges = function (callback) {
    hue.nupnpSearch(function (error, result) {
      if (error) {
        logger.error(error);
        callback(error, result);
      }
      logger.debug("hue bridges found:", result);
      callback(error, result);
    })
  };

  HueController._getBridge = function (bridgeId, callback) {
    ks.get(ksPrefix + ksBridgePrefix + bridgeId, function (err, result) {
      callback(err, result);
    })
  };

  HueController._getBridgeFullState = function (bridgeId) {
    activeBridges[bridgeId].getFullState(function (err, config) {
      if (err) logger.error('unable to get state of bridge [' + bridgeId + ']', err);

      if (config !== null) {
        var keys = Object.keys(config);
        keys.forEach(function (element, index, array) {
          var value = JSON.stringify(config[element]);
          redis.setex(redisPrefix + bridgeId + ':' + element, cacheExpiration, value, function (err, result) {
          })
        });
      }
    })
  };

  HueController._insertBridge = function (bridge, done) {
    ks.set(ksPrefix + ksBridgePrefix + bridge.id + ':meta', JSON.stringify(bridge), function (err, result) {
      HueController._updateBridgeSeen(bridge.id, function (err) {
        logger.debug('bridge added to keystore', bridge);
      });
      done(err);
    })
  };

  HueController._updateActiveBridges = function () {
    var keys = Object.keys(activeBridges);
    keys.forEach(function (element, index, array) {
      HueController._getBridgeFullState(element);
    });
  };

  HueController._updateBridgeSeen = function (bridgeId, done) {
    var d       = new Date();
    var seconds = Math.round(d.getTime() / 1000);

    ks.set(ksPrefix + ksBridgePrefix + bridgeId + ':lastseen', seconds, function (err, result) {
      logger.debug('bridge seen updated [' + seconds + ']', bridgeId);
      done(err);
    })
  };

  HueController._seeBridge = function (bridge) {
    HueController._getBridge(bridge.id, function (err, result) {
      if (result.id == bridge.id) {
        logger.debug('bridge already seen', bridge);
        HueController._updateBridgeSeen(bridge, function (err) {
          HueController._activateBridge(bridge.id);
        });
      } else {
        logger.debug('found new bridge', bridge);
        HueController._insertBridge(bridge, function (err) {
          HueController._activateBridge(bridge.id);
        })
      }
    })
  };

  //init
  HueController._findBridges(function (err, res) {
    res.forEach(function (bridge) {
      console.log(bridge);
      HueController._seeBridge(bridge);
    })
  });

  setInterval(HueController._updateActiveBridges, activeBridgeUpdateInterval);

  return HueController;
};