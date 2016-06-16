var async  = require('async'),
    crypto = require('crypto');

// SQL Statements
var sqlInsertKs = 'INSERT INTO public.ks(k, v, encrypted) VALUES ($1, $2, $3);';
var sqlSelectKs = 'SELECT * FROM public.ks WHERE k = $1;';
var sqlUpdateKs = 'UPDATE public.ks SET v=$2, encrypted=$3 WHERE k=$1';

module.exports = function (db, redis, config, logger) {
  var KsController = {};

  var ksConfig = config.vesta.ks || {};

  var algorithm   = ksConfig.algorithm || 'aes-256-ctr';
  var cacheExp    = ksConfig.cacheExp || 86400; // 24 hours in seconds;
  var redisPrefix = 'keystore:';

  // Encrpytion Functions
  function encrypt(text) {
    var cipher  = crypto.createCipher(algorithm, config.vesta.secret);
    var crypted = cipher.update(text, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  }

  function decrypt(text) {
    var decipher = crypto.createDecipher(algorithm, config.vesta.secret);
    var dec      = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  }

  // Database Operations
  KsController._getDB          = function (key, done) {
    db.query(sqlSelectKs, [key], function (err, result) {
      if (err) {
        return done(err);
      }
      else if (result.rowCount > 0) {
        var ks = result.rows[0];

        if (ks.encrypted) {
          logger.debug('retrieved encrypted key [' + key + '] from database');
          var returnObj   = {};
          returnObj[ks.k] = decrypt(ks.v);
          return done(null, returnObj)
        }
        else {
          logger.debug('retrieved key [' + key + '] from database');
          var returnObj   = {};
          returnObj[ks.k] = ks.v;
          return done(null, returnObj)
        }
      }
      else {
        return done(null, 'NOTFOUND');
      }
    });
  };
  KsController._setDB          = function (key, value, done) {
    db.query(sqlSelectKs, [key], function (err, result) {
      if (err) {
        return done(err);
      }
      else if (result.rowCount == 0) {
        db.query(sqlInsertKs, [key, value, false], function (err, result) {
          if (err) {
            return done(err);
          }
          else {
            logger.debug('created new key [' + key + '] in database');
            return done(null, 'OK');
          }
        });
      }
      else {
        db.query(sqlUpdateKs, [key, value, false], function (err, result) {
          if (err) {
            return done(err);
          }
          else {
            logger.debug('updated key [' + key + '] in database');
            return done(null, 'OK');
          }
        });
      }
    });
  };
  KsController._setEncryptedDB = function (key, value, done) {
    var encValue = encrypt(value);

    db.query(sqlSelectKs, [key], function (err, result) {
      if (err) {
        return done(err);
      }
      else if (result.rowCount == 0) {
        db.query(sqlInsertKs, [key, encValue, true], function (err, result) {
          if (err) {
            return done(err);
          }
          else {
            logger.debug('created new encrypted key [' + key + '] in database');
            return done(null, 'OK');
          }
        });
      }
      else {
        db.query(sqlUpdateKs, [key, encValue, true], function (err, result) {
          if (err) {
            return done(err);
          }
          else {
            logger.debug('updated encrypted key [' + key + '] in database');
            return done(null, 'OK');
          }
        });
      }
    });
  };

  // Redis Operations
  KsController._getRedis = function (key, done) {
    logger.debug('trying to get key [' + key + '] from redis');
    redis.get(redisPrefix + key, function (err, result) {
      if (result != null) {
        logger.debug('retrieved key [' + key + '] from redis');
        redis.expire(redisPrefix + key, cacheExp);
      }
      var returnObj  = {};
      returnObj[key] = result;
      return done(null, returnObj);
    });

  };
  KsController._setRedis = function (key, value, done) {
    redis.setex(redisPrefix + key, cacheExp, value, function (err, result) {
      logger.debug('set key [' + key + '] in redis');
      return done(err, result);
    });
  };

  // Public Operations
  KsController.get = function (key, done) {
    logger.debug('getting key [' + key + ']');
    KsController._getRedis(key, function (err, result) {
      if (result[key] != null) {
        return done(null, result);
      }
      else {
        KsController._getDB(key, function (err, dbResult) {
          if (dbResult != 'NOTFOUND') {
            KsController._setRedis(key, dbResult[key], function (err, result) {
              if (err) {
                logger.error(err);
              }
            });

            return done(null, dbResult);
          }
          else {
            return done(null, 'NOTFOUND');
          }
        })
      }
    })
  };
  KsController.set = function (key, value, done) {
    async.parallel(
      [
        function (callback) {
          KsController._setDB(key, value, callback);
        },
        function (callback) {
          KsController._setRedis(key, value, callback);
        }
      ],
      function (err, result) {
        if (err) {
          done(err);
        }
        else {
          done(null, 'OK');
        }
      });
  };

  return KsController;
};