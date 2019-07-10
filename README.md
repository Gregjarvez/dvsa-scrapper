# dvsa-scrapper

This simple application scrapes the dvsa site for available slots and sends a text message if there is any earlier date
that the afore booked.

It can be configured to send sms when an earlier date is found. 

### Setup
Install dependencies

`npm i` or `yarn `

### Start a scrape
`node index`
By default this command will fetch all slot days and display them in a table

`node index --no-table` will only emit the earliest date without a date.

`node index --no-table --broadcast` will send an sms via the nexmo service if configured.

### Setup a cron job

The `npm link` command allows us to locally ‘symlink a package folder’, it will locally install a `dvsa` command.

Here is a short [article](https://ole.michelsen.dk/blog/schedule-jobs-with-crontab-on-mac-osx.html) to setting up a simple cron job.
