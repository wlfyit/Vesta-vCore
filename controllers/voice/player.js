var player = require('play-sound')(opts = {});

var playing   = false;
var playQueue = [];
var response  = {};

function _playNext(err) {
  if (err) log.error(err);
  if (playQueue.length > 0) {
    var playFile = playQueue.shift();

    player.play(playFile, _playNext);
  } else {
    playing = false;
  }
}

response.playFile = function (file) {
  playQueue.push(file);

  if (!playing) {
    playing = true;

    _playNext();
  }
};

module.exports = response;
