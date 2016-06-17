var amqp               = require('amqplib/callback_api'),
    fs                 = require('fs'),
    Ivona              = require('ivona-node'),
    LargeObjectManager = require('pg-large-object').LargeObjectManager,
    md5                = require('md5'),
    player             = require('./player');

var sqlSelectPhrase      = 'SELECT * FROM public.phrases WHERE voicehash = $1;',
    sqlInsertPhrase      = 'INSERT INTO public.phrases(voicehash, name, language, gender, text, looid) ' +
      'VALUES ($1, $2, $3, $4, $5, $6);',
    sqlPlainSearchPhrase = 'SELECT * FROM public.phrases WHERE to_tsvector(\'english\', text) ' +
      '@@ plainto_tsquery(\'english\', $1);';

module.exports = function (db, ks, config, logger) {
  var ivona;
  var voice;
  var lObjMan         = new LargeObjectManager(db);
  var VoiceController = {};

  ks.get('config:ivona:apikey', function (err, result) {
    ivona = new Ivona(JSON.parse(result['config:ivona:apikey']));
  });
  ks.get('config:ivona:voice', function (err, result) {
    voice = JSON.parse(result['config:ivona:voice']);
  });

  // Connect to amqp queue
  var sendAmqp = null;
  amqp.connect(config.amqp, function (err, conn) {
    if (err) {
      logger.error(err);
    }
    conn.createChannel(function (err, ch) {
      var ex = 'voice';
      ch.assertExchange(ex, 'fanout', {durable: false});


      VoiceController.sayRemote = function (text, destination) {
        VoiceController._voiceHash(text, voice.name, function (vhash) {
          db.query(sqlSelectPhrase, [vhash], function (err, result) {
            var msg       = {
              command    : 'say',
              destination: destination,
              vhash      : vhash
            };
            var msgString = JSON.stringify(msg);

            if (result.rowCount > 0) {
              ch.publish(ex, '', new Buffer(msgString));
              logger.info('sent amqp message [' + msgString + ']');
            } else {
              VoiceController._ivonaRequest(text, function (err, result) {
                if (err) {
                  return logger.error('Unable to request voiceController', err);
                }
                ch.publish(ex, '', new Buffer(msgString));
                logger.info('sent amqp message [' + msgString + ']');
              })
            }
          })
        })
      }
    })
  });

  VoiceController.sayLocal = function (text) {
    VoiceController._voiceHash(text, voice.name, function (vhash) {
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
    VoiceController._ivonaFullRequest(text, voice, cb);
  };

  VoiceController._ivonaFullRequest = function (text, voice, cb) {
    VoiceController._voiceHash(text, voice.name, function (vhash) {
      db.query(sqlSelectPhrase, [vhash], function (err, result) {
        if (result.rowCount > 0) {
          logger.warn('vhash [' + vhash + '] already exists in database.');
        } else {
          logger.debug('retrieving voice into database');
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
                  db.query(sqlInsertPhrase, [vhash, voice.name, voice.language, voice.gender, text, oid],
                    function (err, result) {
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
                  voice: voice
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
    VoiceController._voiceHash(text, voice.name, function (vhash) {
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

  VoiceController.routeGetPhrase     = function (req, res) {
    if (req.params.vhash.match(/^[a-f0-9]{32}$/g)) {
      db.query(sqlSelectPhrase, [req.params.vhash], function (err, result) {
        if (result.rowCount > 0) {
          var phrase = result.rows[0];
          res.send(phrase)
        }
        else {
          res.status(404);
          res.send({'status': 404, 'error': 'Phrase not found'});
        }
      })
    }
    else if (req.params.vhash) {
      res.status(400);
      res.send({'status': 400, 'error': 'VHASH not in MD5 format'});
    }
    else {
      res.status(400);
      res.send({'status': 400, 'error': 'Missing Parameters'});
    }
  };
  VoiceController.routeGetPhraseFile = function (req, res) {
    if (req.params.vhash.match(/^[a-f0-9]{32}$/g)) {
      db.query(sqlSelectPhrase, [req.params.vhash], function (err, result) {
        if (result.rowCount > 0) {
          var phrase = result.rows[0];

          // When working with Large Objects, always use a transaction
          db.query('BEGIN', function (err, result) {
            if (err) {
              res.status(500);
              res.send({'status': 500});
              return db.emit('error', err);
            }

            // If you are on a high latency connection and working with
            // large LargeObjects, you should increase the buffer size
            var bufferSize = 16384;
            lObjMan.openAndReadableStream(phrase.looid, bufferSize, function (err, size, stream) {
              if (err) {
                res.status(500);
                res.send({'status': 500, 'error': 'Unable to read the given large object'});
                return logger.error('Unable to read the given large object', err);
              }

              logger.info('Streaming a large object with a total size of ', size);
              stream.on('end', function () {
                db.query('COMMIT', function (err, response) {
                  if (err)
                    return logger.error('Unable to read the given large object', err);
                });
              });

              res.setHeader('content-type', 'audio/mpeg');
              res.setHeader('Content-disposition', 'attachment; filename=' + req.params.vhash + '.mp3');
              stream.pipe(res);
            });
          });
        }
        else {
          res.status(404);
          res.send({'status': 404, 'error': 'Phrase not found'});
        }
      })
    }
    else if (req.params.vhash) {
      res.status(400);
      res.send({'status': 400, 'error': 'VHASH not in MD5 format'});
    }
    else {
      res.status(400);
      res.send({'status': 400, 'error': 'Missing Parameters'});
    }
  };
  VoiceController.routeSay           = function (req, res) {
    if (req.body.text && req.body.destination) {
      VoiceController.sayRemote(req.body.text, req.body.destination);
      res.send({"status": 200});
    }
    else {
      res.status(400);
      res.send({'status': 400, 'error': 'Missing Parameters'});
    }
  };

  return VoiceController;
};