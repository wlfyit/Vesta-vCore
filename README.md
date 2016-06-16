# Vesta-vCore

Brain for a house. Supports speech and weather so far. Woo!

### Technologies
+ Express
+ [Ivona Voice Cloud](https://www.ivona.com/)
+ PostgreSQL
+ RabbitMQ
+ Redis
+ [Weather Underground](https://www.wunderground.com/weather/api/)

## Configuration
### config.js
```javascript
var config = {};

config.amqp = 'amqp://username:password@localhost:5672/vesta';

config.newrelic             = {};
config.newrelic.app_name    = 'Vesta';
config.newrelic.license_key = 'licensekey';

config.pg = 'pg://username:password@localhost:5432/vesta';

config.redis         = {};
config.redis.options = {
  host          : 'localhost',
  port          : 6379,
  prefix        : 'vesta:'
};
config.redis.pass    = 'password';

config.vesta             = {};
config.vesta.ks          = {};
config.vesta.secret      = 'supersecretencryptionpassword';

module.exports = config;
```

## API
### Users
API for user management.
#### Users - /vesta/api/users/&lt;username&gt;
##### GET
Get a users info
### Voice
Because what future house shouldn't speak.
#### Phrases - /vesta/api/voice/phrases/&lt;vhash&gt;
##### GET
Get phrase metadata for vhash.
#### Phrase Files - /vesta/api/voice/phrases/&lt;vhash&gt;/files
##### GET
Get phrase files for vhash.
#### Say - /vesta/api/voice/say
##### POST
Say something in a part of the house
###### Body
```javascript
{
    "text": "Test to be read.",
    "destination": "vestaremotesayname"
}
```