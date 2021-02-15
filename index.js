#!/usr/bin/env node

const util = require('util');
const simpleGit = require('simple-git');

const mkdirp = require('mkdirp');
const rimraf = util.promisify(require('rimraf'));
const fs = require('fs');
const parseArgs = require('minimist');
const stream = require('logrotate-stream');
const path = require('path');

const argv = parseArgs(process.argv);

let credentials = process.env['GIT-CREDENTIALS'] || argv.credentials || "credentials.json";
credentials = path.resolve(credentials);

let configs = {};

if (fs.existsSync(credentials)) {
    configs = fs.readFileSync(credentials);
    configs = JSON.parse(configs);
}

const token = process.env['GIT-BACKUP-TOKEN'] || argv.token || argv.t || configs.token;
const server = process.env['GIT-BACKUP-SERVER'] || argv.server || argv.s || configs.server;
const folder = process.env['GIT-BACKUP-DESTINATION'] || argv.destination || argv.d || configs.destination || './git-backup';
const login = process.env['GIT-BACKUP-LOGIN'] || argv.login || argv.l || configs.login;

const logfile = process.env['GIT-BACKUP-LOGFILE'] || path.join(folder, 'git-backup.log');
const api = process.env['GIT-BACKUP-API'] || argv.api || configs.api || 'github';

const getRepos = require(`./${api}`);

(async function () {

    if (!server) {
        console.error('[failure] server must be specified using environment variable GIT-BACKUP-SERVER or program argument -s');
        return;
    }
    if (!token) {
        console.error('[failure] private token must be specified using environment variable GIT-BACKUP-TOKEN or program argument -t');
        return;
    }

    try {
        await mkdirp(folder);
        const toLogFile = stream({file: logfile, size: '100k', keep: 5});
        const print = console.log.bind(console);
        const err = console.error.bind(console);
        console.log = s => {
            const msg = `[${new Date().toISOString()}] ${s}`;
            print(msg);
            toLogFile.write(msg + "\n");
        };
        console.error = s => {
            console.log(s);
        };
    } catch (err) {
        console.log(`[failure] ${err.message}`);
    }


    if (argv.cron) {

        const os = require('os').platform();

        let args = process.argv
            .slice(2)
            .filter(x => x !== '--cron')
            .filter(arg => !arg.startsWith('--credentials='))
            .map(arg => `"${arg}"`)
            .join(' ');

        if(fs.existsSync(credentials)){
            args += ` --credentials="${credentials}"`;
        }

        if (os === 'win32' ) {
            await require('./win32')(args);
        } else if(os === 'linux') {
            await require('./linux')(args);
        } else {
            console.log('[failure] only linux, Macos and Windows are supported');
        }
        return;
    }

    const promises = [];
    let success = true;
    try {
        const workingDir = path.join(folder, server
            .replace('https://', '')
            .replace(':', '_'));

        await mkdirp(workingDir);

        let repos = await getRepos({server, token, login});

        const git = simpleGit();

        console.log(`${repos.length} projects found`);

        console.log(`backuping git remote to ${workingDir}`);
        for (let i = 0; i < repos.length && !argv.dryrun; i++) {

            const project = repos[i];
            const url = project.url;
            const dir = project.name.replace(/ /g, '').replace(/\//g, path.sep);

            const dst = path.join(workingDir, dir);
            const promise = mkdirp(dst)
                .then(async () => {
                    let action;
                    try {
                        // before each await on git, set back current working directory (cwd)
                        // since async operations will have chante it for each promise
                        git.cwd(dst);
                        let isRepo = await git.checkIsRepo('root');
                        if (isRepo) {
                            action = 'updating';
                            git.cwd(dst);
                            await git.raw(['remote', 'update']);
                        } else {
                            await rimraf(dst);
                            await mkdirp(dst);
                            action = 'cloning';
                            git.cwd(workingDir);
                            await git.clone(url, dir);
                        }
                        console.log(`[success] ${action} ${url} to ${dir}`)
                    } catch (err) {
                        console.log(`[failure] ${action} ${url} to ${dir} \n ${err.message}`);
                    }
                });
            promises.push(promise);
        }
    } catch (err) {
        console.log(`[failure] ${err.message}`);
        success = false;
    } finally {
        await Promise.all(promises);
        if (success) {
            console.log("[success] done");
        } else {
            console.log("[failure] done");
            process.exit(1);
        }
    }
})();
