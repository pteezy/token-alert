# TokenAlert

I created this lightweight project for myself to be able to alert me when new tokens are listed on 
CoinMarketCap or CoinGecko. I noticed that if you can act quickly on a newly listed token, you can 
**typically** make some decent gains. Please note, you although I have added some links in the notifications
to check the validity of newly listed tokens, **you still have to do your own due diligence and be
prepared to lose 100% of your investment.**

BNB Donations accepted at 0x1aed276fc76c9372ae0e5ef94d3568ef3e66c608

## Getting started

This project was quickly spun up using Node, express, and LowDB. I have this running on my RaspberryPi in my home
but it should run on any operating system.

### Update the application properties

```javascript
// Get your API key from https://coinmarketcap.com/api/
const COIN_MARKET_CAP_API_KEY = '{API_KEY}';

// email
const EMAIL_SERVICE = '{email provider}'; //default gmail
const EMAIL_SENDER = '{sender email}';
const EMAIL_SENDER_PASSWORD = '{sender email password}';
const EMAIL_TO_LIST = '{comma delimited email address list}'; // 'joe@doe.com, john@doe.ca

// pushover.net push notifications to phone. See pushover.net.
const PUSHOVER_TOKEN = '{pushover token}';
const PUSHOVER_USER = '{pushover user}';

// used for logging and notifications
const LOCAL_TIMEZONE = '{your local timezone}'; //defualt America/Denver
const LOCALE = '{your locale}'; //default en-US

const APPLICATION_PORT = 3000;
```

### Install packages
```shell
npm install
```

## Run the service

```shell
./start.sh
```

This will run the service in the background.

## Stop the service

```shell
./kill.sh
```

## APIs

To make things a bit easy, I create some APIs that you can call locally to stop the service, or start it.

You will need to know your local IP Address. My raspberry pi has the ip of 192.168.1.67

### /status

Get the current status of the service.

#### Request
```http request
GET http://192.168.1.67:3000/status
```

#### Response
```json
{
  "status": "Alerting is running at 1 minute intervals"
}
```

### /logs

Get the logs of the service.

#### Request
```http request
GET http://192.168.1.67:3000/logs
```

#### Response
```json
[
  "11/15/2021, 10:28:59 AM: Starting up",
  "11/15/2021, 10:28:59 AM: Total tokens in database: 93",
  "11/15/2021, 10:28:59 AM: Server Started. Listening on port 3000",
  "11/15/2021, 10:29:07 AM: Alerting is running at 1 minute intervals",
  ""
]
```

### /stop

Stop any scheduled tasks to make requests to CoinMarketCap and CoinGecko.

#### Request
```http request
GET http://192.168.1.67:3000/stop
```

#### Response
```json
{
  "status": "Stopping running of new alert tasks"
}
```
or
```json
{
  "status": "No task running"
}
```

### /start

Start polling for new tokens at provided intervals.

#### Request
:interval - In minutes, how often the job should kick off. For example http://192.168.1.67:3000/start/5 will run the
job every 5 minutes.

```http request
GET http://192.168.1.67:3000/start/:interval
```

#### Response
```json
{
  "status": "Started running at 5 minute intervals"
}
```

### /catchup

Make a request for new tokens (that may have been added while the service was down) without sending notifications out.

#### Request
```http request
GET http://192.168.1.67:3000/catchup
```

#### Response
```json
{
  "status": "Catching up on missed tokens. Will not notify."
}
```
