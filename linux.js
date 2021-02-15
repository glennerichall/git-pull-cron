const editor = require('crontab');
const fs = require('fs');
var path = require("path");

module.exports = (args) => {
    console.log("[info] installing crontab job for Linux");



    return new Promise((resolve, reject) => {
        editor.load((err, crontab) => {
            const comment = 'git backup daily';
            const jobs = crontab.jobs({comment: /git backup daily/});
            if (jobs.length !== 0) {
                console.log(`[info] job "${comment}" already exists`);
                console.log(`[info] deleting "${comment}"`);
                crontab.remove({comment: /git backup daily/});
            }
            console.log(`[info] creating "${comment}"`);

            const job = crontab.create(`git-pull-cron ${args}`, '@daily', comment);

            if (job == null) {
                reject('failed to create job');
            } else {
                crontab.save(function (err, crontab) {
                    if (err) reject(err)
                    else resolve();
                });
            }
        });
    });
}
