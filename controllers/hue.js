var hue = require("node-hue-api");

module.exports = function (redis, ks, logger) {
  var activeBridges     = [],
      HueController     = {},
      redisPrefix       = 'hue:',
      redisBridgePrefix = 'bridge:';

  HueController._findBridges = function (callback) {
    hue.nupnpSearch(function (error, result) {
      if (error) {
        logger.error(error);
        callback(error, result);
      }
      logger.debug("hue bridges found:", result);
      callback(error, result);
    });
  };

  HueController._getBridge = function (bridgeId, callback) {
    ks.get(redisPrefix + redisBridgePrefix + bridgeId, function (err, result) {
      callback(err, result);
    });
  };

  HueController._insertBridge = function (bridge) {
    ks.set(redisPrefix + redisBridgePrefix + bridge.id + ':meta', JSON.stringify(bridge), function (err, result) {
      HueController._updateBridgeSeen(bridge.id);
      logger.debug('bridge added to keystore', bridge);
    });
  };

  HueController._updateBridgeSeen = function (bridgeId) {
    var d       = new Date();
    var seconds = Math.round(d.getTime() / 1000);

    ks.set(redisPrefix + redisBridgePrefix + bridgeId + ':lastseen', seconds, function (err, result) {
      logger.debug('bridge seen updated [' + seconds + ']', bridgeId);
    });
  };

  HueController._seeBridge = function (bridge) {
    HueController._getBridge(bridge.id, function (err, result) {
      if (result.id == bridge.id) {
        logger.debug('bridge already seen', bridge);
        HueController._updateBridgeSeen(bridge);
      } else {
        logger.debug('found new bridge', bridge);
        HueController._insertBridge(bridge);
      }
    });
  };

  //init
  HueController._findBridges(function (err, res) {
    res.forEach(function (bridge) {
      console.log(bridge);
      HueController._seeBridge(bridge);
    });
  });

  return HueController;
};