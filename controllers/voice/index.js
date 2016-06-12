var amqp               = require('amqplib/callback_api'),
    fs                 = require('fs'),
    Ivona              = require('ivona-node'),
    LargeObjectManager = require('pg-large-object').LargeObjectManager,
    md5                = require('md5'),
    player             = require('./player');

module.exports = function (db, config, logger) {
  var sqlSelectPhrase = 'SELECT * FROM public.phrases WHERE voicehash = $1;';
  var sqlInsertPhrase = 'INSERT INTO public.phrases(voicehash, name, language, gender, text, looid) ' +
    'VALUES ($1, $2, $3, $4, $5, $6);';

  var lObjMan         = new LargeObjectManager(db);
  var ivona           = new Ivona(config.ivona.apikey);
  var VoiceController = {};

  // Connect to amqp queue
  var sendAmqp = null;
  amqp.connect(config.amqp, function (err, conn) {
    if (err) {
      logger.error(err);
    }
    conn.createChannel(function (err, ch) {
      var ex   = 'voiceController';
      var msg  = process.argv.slice(2).join(' ') || 'Hello World!';

      ch.assertExchange(ex, 'fanout', {durable: false});


      VoiceController.sayRemote = function (text, destination) {
        VoiceController._voiceHash(text, config.ivona.voice.name, function (vhash) {
          db.query(sqlSelectPhrase, [vhash], function (err, result) {
            var msg = {
              command    : 'say',
              destination: destination,
              vhash      : vhash
            };

            if (result.rowCount > 0) {
              ch.publish(ex, '', new Buffer(JSON.stringify(msg)));
              logger.info('sent amqp message [' + msg + ']');
            } else {
              VoiceController._ivonaRequest(text, function (err, result) {
                if (err) {
                  return logger.error('Unable to request voiceController', err);
                }
                ch.publish(ex, '', new Buffer(JSON.stringify(msg)));
                logger.info('sent amqp message [' + msg + ']');
              })
            }
          })
        })
      }
    })
  });


  VoiceController.sayLocal = function (text) {
    VoiceController._voiceHash(text, config.ivona.voice.name, function (vhash) {
      // create filename
      var file = 'phrases/' + vhash + '.mp3';

      fs.stat(file, function (err, stat) {
        if (err == null) {
          player.playFile(file);
        } else if (err.code == 'ENOENT') {
          logger.info('retrieving file.');
          VoiceController._ivonaGetFile(text, function (err, response) {
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

  VoiceController._ivonaRequest = function (text, cb) {
    VoiceController._voiceHash(text, config.ivona.voice.name, function (vhash) {
      db.query(sqlSelectPhrase, [vhash], function (err, result) {
        if (result.rowCount > 0) {
          logger.warn('VHASH: ' + vhash + ' already exists in database.');
        } else {
          logger.debug('retrieving voiceController into database');
          db.query('BEGIN', function (err, result) {
            if (err) {
              cb(err);
              return db.emit('error', err);
            }

            // If you are on a high latency connection and working with
            // large LargeObjects, you should increase the buffer size
            var bufferSize = 16384;
            lObjMan.createAndWritableStream(bufferSize, function (err, oid, stream) {
              if (err) {
                cb(err);
                return logger.error('Unable to create a new large object', err);
              }

              // The server has generated an oid
              logger.info('Creating phrase with the oid ', oid);
              stream.on('finish', function () {
                // Actual writing of the large object in DB may
                // take some time, so one should provide a
                // callback to client.query.
                db.query('COMMIT', function (err, result) {
                  db.query(sqlInsertPhrase, [vhash, config.ivona.voice.name, config.ivona.voice.language,
                    config.ivona.voice.gender, text, oid], function (err, result) {
                    if (err) {
                      cb(err);
                      return client.emit('error', err);
                    }

                    var response = {
                      voicehash: vhash,
                      text     : text,
                      oid      : oid
                    };
                    cb(null, response);
                  });
                });
              });

              ivona.createVoice(text, {
                body: {
                  voice: config.ivona.voice
                }
              }).pipe(stream);
            });
          });
        }
      });
    });
  };

  VoiceController._ivonaDBToFile = function (vhash, cb) {


    db.query(sqlSelectPhrase, [vhash], function (err, result) {
      if (result.rowCount > 0) {
        var phrase = result.rows[0];
        console.log(phrase);

        // When working with Large Objects, always use a transaction
        db.query('BEGIN', function (err, result) {
          if (err) {
            cb(err);
            return client.emit('error', err);
          }

          // If you are on a high latency connection and working with
          // large LargeObjects, you should increase the buffer size
          var bufferSize = 16384;
          lObjMan.openAndReadableStream(phrase.looid, bufferSize, function (err, size, stream) {
            if (err) {
              cb(err);
              return logger.error('Unable to read the given large object', err);
            }

            logger.info('Streaming a large object with a total size of ', size);
            stream.on('end', function () {
              db.query('COMMIT', cb);
            });

            // Store it as an image
            var fileStream = fs.createWriteStream('phrases/' + vhash + '.mp3');
            stream.pipe(fileStream);
          });
        });
      } else {
        cb('notindb');
        logger.warn('VHASH: ' + vhash + ' does not exist in database.');
      }
    });


  };

  VoiceController._ivonaGetFile = function (text, cb) {
    VoiceController._voiceHash(text, config.ivona.voice.name, function (vhash) {
      var file = 'phrases/' + vhash + '.mp3';

      fs.stat(file, function (err, stat) {
        if (err == null) {
          logger.debug('File ' + file + ' already exists');
          cb(null, {file: file});
        } else if (err.code == 'ENOENT') {
          logger.info('retrieving file.');
          db.query(sqlSelectPhrase, [vhash], function (err, result) {
            if (result.rowCount > 0) {
              VoiceController._ivonaDBToFile(vhash, function (err, result) {
                cb(null, {file: file});
              })
            } else {
              VoiceController._ivonaRequest(text, function (err, result) {
                VoiceController._ivonaDBToFile(vhash, function (err, result) {
                  cb(null, {file: file});
                })
              });
            }
          })
        } else {
          cb(err);
        }
      });


    })
  };

  /*  VoiceController._ivonaGetFile = function (text, voiceObj, file, cb) {
   logger.debug('retrieving voiceController into file %s', file);
   ivona.createVoice(text, {
   body: {
   voiceController: voiceObj
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
   };*/

  return VoiceController;
};