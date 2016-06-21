var osc = require('osc');


module.exports = function (redis, ks, logger) {
  var redisPrefix       = 'osc:',
      redisRemotePrefix = 'remote:';

  var udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort   : 8000
  });

  logger.info('listening for osc');

  // Listen for incoming OSC bundles.
  udpPort.on("error", function (error) {
    logger.error("osc: ", JSON.stringify(error));
  });

  udpPort.on("bundle", function (oscBundle, timeTag, info) {
    console.log("An OSC bundle just arrived for time tag", timeTag, ":", oscBundle);
    console.log("Remote info is: ", info);
  });
  udpPort.on("message", function (oscBundle, timeTag, info) {
    var d       = new Date();
    var seconds = Math.round(d.getTime() / 1000);

    console.log("An OSC message just arrived for time tag", seconds, ":", oscBundle);
    console.log("Remote info is: ", info);
  });

  // Open the socket.
  udpPort.open();

  var OSCController = {};

  OSCController._seeRemote = function (remote) {

  };

  return OSCController;
};