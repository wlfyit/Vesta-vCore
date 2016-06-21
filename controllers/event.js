var amqp = require('amqplib/callback_api');

module.exports = function (amqp, redis, ks, logger) {
  var redisPrefix = 'event:';

  var eventController = {};

  eventController._getChanConsumer      = function (exchange, done) {
    amqp.createChannel(function (err, ch) {
      if (err)
        logger.error('error getting channel consumer', err);

      ch.assertExchange(exchange, 'fanout', {durable: false});

      ch.assertQueue('', {exclusive: true}, function (err, q) {
        ch.bindQueue(q.queue, exchange, '');

        done(err, ch);
      });
    });
  };
  eventController._getChanPublisher     = function (exchange, done) {
    conn.createChannel(function (err, ch) {
      if (err)
        logger.error('error getting channel publisher', err);

      ch.assertExchange(exchange, 'fanout', {durable: false});

      done(err, ch);
    });
  };
  eventController._getChanTopicConsumer = function (exchange, topics, done) {
    amqp.createChannel(function (err, ch) {
      if (err)
        logger.error('error getting topic subscription', err);

      ch.assertExchange(exchange, 'topic', {durable: false});

      ch.assertQueue('', {exclusive: true}, function (err, q) {
        topics.forEach(function (key) {
          ch.bindQueue(q.queue, exchange, key);
        });

        done(err, ch)
      });
    });
  };

  return eventController;
};