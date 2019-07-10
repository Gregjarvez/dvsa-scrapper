#!/usr/bin/env node

const fs = require('fs');
const ora = require('ora');
const path = require('path');
const util = require('util');
const Nexmo = require('nexmo');
const dotEnv = require('dotenv');
const Table = require('tty-table');
const puppeteer = require('puppeteer');
const format = require('date-fns/format');

dotEnv.config({ path: path.resolve(__dirname, './.env') });

const entryUri = process.env.LOGIN_URI;
const licenseNumber = process.env.LICENCE_NUMBER;
const candidateNumber = process.env.CANDIDATE_NUMBER;

const nexmo = new Nexmo({
  apiKey: process.env.NEXMO_API_KEY,
  apiSecret: process.env.NEXMO_API_SECRET,
});

/**
 * Authentication page selectors
 * @type {string}
 */
const loginButton = 'input[id="booking-login"]';
const licenseNumberInputSelector = 'input[id="driving-licence-number"]';
const candidateNumberInputSelector = 'input[id="application-reference-number"]';

/**
 * Edit booking page selectors
 */
const editTestDaySelector = '#edit-test-date-buttons';
const testDateChoiceSubmitSelector = '#driving-licence-submit';
const testDateChoiceSelector = 'input[id="test-choice-earliest"]';

/**
 * Slot page selectors
 */
const calenderTable = '.BookingCalendar-datesBody';
const bookableSotsSelector = '.BookingCalendar-date--bookable';
const availableDateLinkSelector = '.BookingCalendar-dateLink';

/**
 *
 * @param page
 * @returns {Promise<void>}
 */
async function fillCredentials(page) {
  const licenseNumberInput = await page.$(licenseNumberInputSelector);
  const candidateNumberInput = await page.$(candidateNumberInputSelector);

  await licenseNumberInput.type(licenseNumber);
  await candidateNumberInput.type(candidateNumber);
}

/**
 *
 * @param page
 * @returns {Promise<void>}
 */
async function logTheFuckIn(page) {
  const submitFormTrigger = await page.$(loginButton);
  await submitFormTrigger.click();

  await page.waitForNavigation();
}

/**
 *
 * @param page
 * @returns {Promise<void>}
 */
async function goToSlotBookingPage(page) {
  const testDaysAnchorContainer = await page.$(editTestDaySelector);
  const [changeTestDay, findTestInThreedays] = await testDaysAnchorContainer.$$(
    'a',
  );
  await changeTestDay.click();

  await page.waitForNavigation();

  const submit = await page.$(testDateChoiceSubmitSelector);
  const earliestBookingDates = await page.$(testDateChoiceSelector);

  await earliestBookingDates.click();

  await submit.click();

  await page.waitForNavigation();
}

/**
 *
 * @param page
 * @returns {Promise<Array>}
 */
async function getSlotsDays(page) {
  const slots = await page.$$(
    `${bookableSotsSelector} ${availableDateLinkSelector}`,
  );

  const dates = [];
  for (const slot of slots) {
    const date = await page.evaluate(e => e.getAttribute('data-date'), slot);

    dates.push(date);
  }
  return dates;
}

/**
 *
 * @param days
 * @returns {{headerColor : string, color : string, width : number, align :
 *   string, value : any, paddingLeft : number}[]}
 */
function getTableHeaders(days) {
  const headers = days.reduce(
    (dates, day) => dates.add(format(day, 'MMMM')),
    new Set([]),
  );

  return Array.from(headers).map(value => ({
    value,
    width: 30,
    color: 'white',
    align: 'center',
    paddingLeft: 5,
    headerColor: 'cyan',
  }));
}

function sendSMS(text) {
  [process.env.TO, process.env.TO_SECONDARY].forEach(number => {
    nexmo.message.sendSms(
      process.env.FROM,
      number,
      text,
      (err, responseData) => {
        if (err) return;
        console.log('message sent 🚀 ✉️✉️✉️✉ 🚀️');
      },
    );
  });
}
/**
 *
 * @param headers
 * @param days
 * @returns {Array}
 */
function getTablesRows(headers, days) {
  const columnHeaders = headers.map(({ value }) => value);
  const columnCount = columnHeaders.length;
  const rows = [];

  for (let day of days) {
    const position = columnHeaders.indexOf(format(day, 'MMMM'));
    const openRow = rows.find(row => row[position] === undefined);

    if (openRow) {
      openRow[position] = format(day, 'Do MMMM YYYY');

      continue;
    }
    const row = Array.from({ length: columnCount });
    row[position] = format(day, 'Do MMMM YYYY');
    rows.push(row);
  }

  return rows;
}

async function broadcastIfNeccesaryAndUpdateCache(date) {
  const localStorageFilePath = path.resolve(__dirname, './log.txt');

  const previousDate = fs.readFileSync(localStorageFilePath, {
    encoding: 'utf8',
  });
  const forceBroadcast = process.argv.slice(2)[0] === '--broadcast';
  const dateChanged = date !== previousDate;

  if (dateChanged) {
    await fs.writeFile(localStorageFilePath, date, 'utf8', () => {});
  }

  if (forceBroadcast || dateChanged) {
    const text = `Earlier date: ${date} Reference Number: ${candidateNumber} Licence Number: ${licenseNumber} login page: ${entryUri}`;
    sendSMS(text);
  }
}

/**
 * Main
 * @returns {Promise<void>}
 */
async function freakingGetMeAvailableSlots() {
  const spinner = ora('Initializing.....').start();

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const response = await page.goto(entryUri);

  try {
    spinner.succeed('Initialized🔨');
    spinner.succeed(`DL: ${licenseNumber} RF: ${candidateNumber}`);
    await fillCredentials(page);
    spinner.succeed('filled credentials 🤫');
    await logTheFuckIn(page);
    spinner.succeed('Logged in 🤫');
    await goToSlotBookingPage(page);
    spinner.succeed('Loaded slot page 🤫');
  } catch (e) {
    console.log(e.message);
    spinner.fail('failed to authenticate 🍆');
    process.exit(0);
  }

  try {
    spinner.start('retrieving slot days....');
    const days = await getSlotsDays(page);
    spinner.succeed('💩💩💩💩💩');

    const headers = getTableHeaders(days);
    const rows = getTablesRows(headers, days);

    const table = Table(headers, rows, {
      borderStyle: 1,
      borderColor: 'blue',
      paddingBottom: 0,
      headerAlign: 'center',
      align: 'center',
      color: 'white',
      truncate: '...',
    });

    if (!process.argv.includes('--no-table')) {
      console.log(table.render());
    }

    const [earliestDate] = rows.flat().filter(Boolean);

    await broadcastIfNeccesaryAndUpdateCache(earliestDate);
  } catch (e) {
    spinner.fail('failed to retrieve slot days🍆');
    process.exit(0);
  } finally {
    await browser.close();
  }
}

freakingGetMeAvailableSlots();
