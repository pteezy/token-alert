import express from 'express';
import cron from 'node-cron';
import axios from 'axios';
import {join, dirname} from 'path';
import {Low, JSONFile} from 'lowdb';
import {fileURLToPath} from 'url';
import lodash from 'lodash';
import cheerio from 'cheerio';
import nodemailer from 'nodemailer';
import fs from 'fs';

const __DIRNAME = dirname(fileURLToPath(import.meta.url));
const APP = express();
const FILE = join(__DIRNAME, 'db.json');
const ADAPTER = new JSONFile(FILE);
const DB = new Low(ADAPTER);

var task;

const COIN_GECKO_URL = 'https://www.coingecko.com/en/coins/recently_added';
let DEFAULT_MINUTES_INTERVAL = 0;

const COIN_MARKET_CAP_API_KEY = '{key}';

// email
const EMAIL_SERVICE = 'gmail';
const EMAIL_SENDER = '{sender email}';
const EMAIL_SENDER_PASSWORD = '{sender email password}';
const EMAIL_TO_LIST = '{comma delimited list}';

// pushover.net push notifications to phone. See pushover.net.
const PUSHOVER_TOKEN = '{pushover token}';
const PUSHOVER_USER = '{pushover user}';

// used for logging and notifications
const LOCAL_TIMEZONE = 'America/Denver';
const LOCALE = 'en-US';

const APPLICATION_PORT = 3000;

// Setup the mail transporter (this is the sender credentials)
var transporter = nodemailer.createTransport({
    service: EMAIL_SERVICE,
    auth: {
        user: EMAIL_SENDER,
        pass: EMAIL_SENDER_PASSWORD
    }
});


// For notifications, format the currency nicely
const currencyFormatter = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'USD',
});

// read, and initialize the database if necessary
await DB.read();
DB.chain = lodash.chain(DB.data);
DB.data ||= {tokens: []};
DB.write();

// log the total amount of saved tokens for fun
let tokens = DB.chain.get('tokens');
let totalCount = 0;

if (tokens && tokens.value()) {
    totalCount = tokens.value().length;
}

console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Starting up`);
console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Total tokens in database: ${totalCount}`)

// function to send a Pushover (https://pushover.net/) notification and email notification
function sendNotification(extractedToken) {
    axios.post('https://api.pushover.net/1/messages.json', {
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        message: `
Name
${extractedToken.name} - ${extractedToken.symbol}

Market Cap
${currencyFormatter.format(extractedToken.marketCap)} USD

24 Hour Volume
${currencyFormatter.format(extractedToken.volume)} USD

Address
${extractedToken.address}

TokenSniffer
https://tokensniffer.com/token/${extractedToken.address}

PooCoin
https://poocoin.app/tokens/${extractedToken.address}

${extractedToken.dataSource}
${extractedToken.url}

PancakeSwap
https://pancakeswap.finance/swap?outputCurrency=${extractedToken.address}`,
        title: `New Token Alert (${extractedToken.dataSource}): ${extractedToken.symbol} added ${new Date(extractedToken.dateAdded).toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}`
    });


    var mailOptions = {
        from: EMAIL_SENDER,
        to: EMAIL_TO_LIST,
        subject: `New Token Alert (${extractedToken.dataSource}): ${extractedToken.symbol} added ${new Date(extractedToken.dateAdded).toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}`,
        html: `
    <b>Name</b>
    <div>${extractedToken.name} - ${extractedToken.symbol}</div>
    
    <div><br></div>
    <b>Market Cap</b>
    <div>${currencyFormatter.format(extractedToken.marketCap)} USD</div>
    
    <div><br></div>
    <b>24 Hour Volume</b>
    <div>${currencyFormatter.format(extractedToken.volume)} USD</div>
    
    <div><br></div>
    <b>Address</b>
    <div>${extractedToken.address}</div>
    
    <div><br></div>
    <b>TokenSniffer</b>
    <div><a href="https://tokensniffer.com/token/${extractedToken.address}">https://tokensniffer.com/token/${extractedToken.address}</a>
    
    <div><br></div>
    <b>PooCoin</b>
    <div><a href="https://poocoin.app/tokens/${extractedToken.address}">https://poocoin.app/tokens/${extractedToken.address}</a>
    
    <div><br></div>
    <b>${extractedToken.dataSource}</b>
    <div><a href="${extractedToken.url}">${extractedToken.url}</a>
    
    <div><br></div>
    <b>PancakeSwap</b>
    <div><a href="https://pancakeswap.finance/swap?outputCurrency=${extractedToken.address}">https://pancakeswap.finance/swap?outputCurrency=${extractedToken.address}</a>`
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Error sending email`)
            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: ${error}`)
        } else {
            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Email Sent`)
        }
    });
}

// the main task. It will make an API request to CoinMarketCap for the latest tokens and save them to the database if they do not exist. If they are saved, it will notify.
// This will also scrape the CoinGecko latest listings page for new tokens. CoinGeko APIs do not provide a "recently listed" list just a list of all coins.
async function run(notify) {
    await DB.read()
    DB.chain = lodash.chain(DB.data);

    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Making request to CoinMarketCap`);

    axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?CMC_PRO_API_KEY=${COIN_MARKET_CAP_API_KEY}&sort=date_added&limit=10`)
        .then(async response => {
            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Success response from CoinMarketCap`);

            for (const index in response.data.data) {
                var token = response.data.data[index];

                if (token.platform && token.platform.symbol && token.platform.symbol === 'BNB') {

                    var extractedToken = {
                        name: token.name,
                        symbol: token.symbol,
                        address: token.platform.token_address,
                        dateAdded: token.date_added,
                        slug: token.slug,
                        url: `https://coinmarketcap.com/currencies/${token.slug}`,
                        marketCap: token.quote.USD.fully_diluted_market_cap,
                        volume: token.quote.USD.volume_24h,
                        dataSource: 'CoinMarketCap'
                    }

                    const matchingToken = DB.chain
                        .get('tokens')
                        .find({address: extractedToken.address, dataSource: 'CoinMarketCap'})
                        .value();

                    if (!matchingToken) {
                        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Inserting new token: ${extractedToken.symbol}`);
                        DB.data.tokens.push(extractedToken);

                        if (notify) {
                            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Sending push notification.`)
                            sendNotification(extractedToken);
                        }
                    }
                }
            }

            await DB.write();
        })
        .catch(error => {
            console.log(`${new Date().toLocaleString()}: Error in CoinMarketCap request.`);
            console.log(`${new Date().toLocaleString()}: ${error}`);
        });


    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Making request to CoinGecko`);

    axios.get(COIN_GECKO_URL)
        .then(async response => {
            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Success response from CoinGecko`);

            const html = response.data;
            const $ = cheerio.load(html);
            const priceTable = $('.coin-table tbody tr');

            priceTable.each(function () {
                const chain = $(this).find('.coin-name').eq(1).attr('data-sort');

                if (chain === 'Binance Smart Chain') {

                    const added = $(this).find('td.trade').text().trim().split(' ');
                    const unit = added[0];
                    const measure = added[1];

                    var date = new Date();
                    if (measure === 'hours') {
                        date.setHours(date.getHours() - unit);
                    } else if (measure === 'minutes') {
                        date.setMinutes(date.getMinutes() - unit);
                    }

                    var extractedToken = {
                        name: $(this).find('.coin-name').eq('0').attr('data-sort'),
                        symbol: $(this).find('.coin-name div span').first().text().trim(),
                        address: $(this).find('i[data-address]').attr('data-address'),
                        dateAdded: date.toISOString(),
                        slug: $(this).find('.coin-name').eq('0').attr('data-sort'),
                        url: `https://www.coingecko.com/en/coins${$(this).find('.coin-name a').eq(0).attr('href')}`,
                        marketCap: 'Unable to obtain from CoinGecko',
                        volume: $(this).find('td.td-liquidity_score').text().trim().replace('$', '').replace(/,/g, ''),
                        dataSource: 'CoinGecko'
                    }


                    const matchingToken = DB.chain
                        .get('tokens')
                        .find({address: extractedToken.address, dataSource: 'CoinGecko'})
                        .value();

                    if (!matchingToken) {
                        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Inserting new token: ${extractedToken.symbol}`);
                        DB.data.tokens.push(extractedToken);

                        if (notify) {
                            console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Sending push notification.`)
                            sendNotification(extractedToken);
                        }
                    }

                }
            });

            await DB.write();
        })
        .catch(error => {
            console.log(`${new Date().toLocaleString()}: Error in CoinGecko request.`);
            console.log(`${new Date().toLocaleString()}: ${error}`);
        });
}

// schedule the task to run an an interval of "interval" minutes. Stop any existing tasks if they are running.
function scheduleAndStart(interval) {
    if (task) {
        task.stop();
    }

    task = cron.schedule('*/' + interval + ' * * * *', function () {
        run(true);
    });
}

// check the running interval of tasks
APP.get('/status', (req, res) => {
    var response = {
        status: `Alerting is running at ${DEFAULT_MINUTES_INTERVAL} minute intervals`
    }
    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Alerting is running at ${DEFAULT_MINUTES_INTERVAL} minute intervals`);
    res.json(response);
});

// start the task at any desired interval. Remember that the free CMC API only allows 300 daily calls and 10000 monthly calls.
// This is not a RESTFUL API since we are doing something on a GET, but it just makes it easy...
APP.get('/start/:interval', (req, res) => {
    DEFAULT_MINUTES_INTERVAL = req.params.interval;

    scheduleAndStart(DEFAULT_MINUTES_INTERVAL);

    var response = {
        status: `Started running at ${DEFAULT_MINUTES_INTERVAL} minute intervals`
    }
    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Started running at ${DEFAULT_MINUTES_INTERVAL} minute intervals`);
    res.json(response);
});

// I typically have the service shut down over night. This allows me to catch up on any tokens listed overnight and not notify. I typically act on newly listed tokens
// when I am awake...
APP.get('/catchup', (req, res) => {
    run(false);

    var response = {
        status: `Catching up on missed tokens. Will not notify.`
    }
    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Catching up on missed tokens. Will not notify.`);
    res.json(response);
});

// Stop all tasks
// This is not a RESTFUL API since we are doing something on a GET, but it just makes it easy...
APP.get('/stop', (req, res) => {
    DEFAULT_MINUTES_INTERVAL = 0;

    if (task) {
        task.stop();
        var response = {
            status: `Stopping running of new alert tasks`
        }
        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Stopping running at ${DEFAULT_MINUTES_INTERVAL} minute intervals`);
    } else {
        var response = {
            status: `No task running`
        }
        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: No task running`);
    }

    fs.truncate('app.log', 0, function () {
        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Cleared log file`);
    })

    res.json(response);
});

// Spit out the logs
APP.get('/logs', (req, res) => {
    const data = fs.readFileSync('app.log', 'utf8')
    res.send(data.toString().split(/\n/g));
});

// Start up the server
const server = APP.listen(APPLICATION_PORT, () => console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Server Started. Listening on port ${APPLICATION_PORT}`));

// When the process is killed, log it.
process.on('SIGTERM', () => {
    console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Shutting down`);
    server.close(() => {
        console.log(`${new Date().toLocaleString(LOCALE, {timeZone: LOCAL_TIMEZONE})}: Server closed`);
    });
});

