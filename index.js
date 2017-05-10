#!/usr/bin/env node

const request = require('superagent-promise')(require('superagent'), Promise);
const sGit = require('simple-git');
const bluebird = require('bluebird');
const mkdirp = bluebird.promisify(require('mkdirp'));
const fs = require('fs');
const exists = bluebird.promisify(fs.access);
const parseArgs = require('minimist');
const stream = require('logrotate-stream');
const path = require('path');

const argv = parseArgs(process.argv);
const token = process.env['GIT-BACKUP-TOKEN'] || argv.token || argv.t;
const server = process.env['GIT-BACKUP-SERVER'] || argv.server || argv.s;
const folder = process.env['GIT-BACKUP-DESTINATION'] || argv.folder || argv.f || 'git-backup';
const logfile = process.env['GIT-BACKUP-LOGFILE'] || path.join(folder, 'git-backup.log');

const toLogFile = stream({file: logfile, size: '100k', keep: 5});

const print = console.log.bind(console);
console.log = s => {
    const msg = `[${new Date().toISOString()}] ${s}`;
    print(msg);
    toLogFile.write(msg + "\n");
};

(async function () {

    const promises = [];
	let success = true;
    try {
        const workingDir = path.join(folder, server.replace(':', '_'));

        await mkdirp(workingDir);
        const git = sGit(workingDir);

        const getProjects = (archived) => request
            .get(`https://${server}/api/v4/projects`)
            .set('PRIVATE-TOKEN', token)
            .set('Accept', 'application/json')
            .query({archived})
            .end();

        let projects0 = await getProjects(false);
        let projects1 = await getProjects(true);
        const projects = projects0.body.concat(projects1.body);

        console.log(`${projects.length} projects found`);

        console.log(`backuping git remote to ${workingDir}`);
        for (let i = 0; i < projects.length && !argv.dryrun; i++) {
            const project = projects[i];
            const url = project.ssh_url_to_repo;
            const dir = project.name_with_namespace.replace(/ /g, '').replace(/\//g, path.sep);

            const promise = mkdirp(`${workingDir}/${dir}`)
                .then(async() => {
                    try {
                        await exists(path.join(workingDir, dir, 'config'));
                        git.cwd(path.join(workingDir, dir));
                        await git.raw(['remote', 'update']);
                        console.log(`[success] updating ${url}`)
                    } catch (err) {
                        await git.mirror(url, dir);
                        console.log(`[success] cloning ${url}`);
                    }
                });

            promises.push(promise);
        }
    } catch (err) {
        console.log(`[failure] ${err.message}`);
        success = false;
    } finally {
        await bluebird.all(promises);
        if (success) {
            console.log("[success] done");
            toLogFile.end();
        }
        else {
            console.log("[failure] done");
            toLogFile.end();
            process.exit(1);
        }
    }


})();
