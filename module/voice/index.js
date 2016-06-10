var amqp               = require('amqplib/callback_api'),
    fs                 = require('fs'),
    Ivona              = require('ivona-node'),
    LargeObjectManager = require('pg-large-object').LargeObjectManager,
    md5                = require('md5'),
    player             = require('./player');

module.exports = function (db, config, logger) {
  var lObjMan = new LargeObjectManager(db);
  var ivona   = new Ivona(config.ivona.apikey);

  // Connect to amqp queue
  var sendAmqp = null;
  amqp.connect(config.amqp, function (err, conn) {
    if (err) {
      logger.error(err);
    }
    conn.createChannel(function (err, ch) {
      var ex  = 'voice';
      var msg = process.argv.slice(2).join(' ') || 'Hello World!';

      ch.assertExchange(ex, 'fanout', {durable: false});

      ch.publish(ex, '', new Buffer(msg));
      console.log(" [x] Sent %s", msg);
    });
  });

  var VoiceController = {};

  VoiceController._sayLocal = function (text) {
    VoiceController._voiceHash(text, config.ivona.voice.name, function (vhash) {
      // create filename
      var file = 'phrases/' + vhash + '.mp3';

      fs.stat(file, function (err, stat) {
        if (err == null) {
          player.playFile(file);
        } else if (err.code == 'ENOENT') {
          logger.info('retrieving file.');
          VoiceController._ivonaGetFile(text, config.ivona.voice, file, function (response) {
            player.playFile(response.file);
          });
        } else {
          log.error(err);
        }
      });
    });
  };

  VoiceController._voiceHash = function (text, voiceName, cb) {
    cb(md5(voiceName + '|' + text));
  };

  VoiceController._ivonaGetFile = function (text, voiceObj, file, cb) {
    logger.debug('retrieving voice into file %s', file);
    ivona.createVoice(text, {
      body: {
        voice: voiceObj
      }
    }).pipe(
      fs.createWriteStream(file)
    ).on('finish', function (result) {
        var response = {
          text: text,
          file: file
        };
        cb(response)
      }
    );
  };

  return VoiceController;
};